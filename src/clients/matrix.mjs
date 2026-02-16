import { createClient } from "matrix-js-sdk";
import EventEmitter from "events";

export default class matrix extends EventEmitter {
  constructor(options) {
    super();
    this.options  = options || {};
    this.baseUrl  = options.baseUrl || "https://matrix.org";
    this.token    = options.token || null;
    this.userId   = options.userId || null;
    if (!this.userId && this.token) {
        // Try to derive userId if not provided but we have a token? 
        // Actually usually you need userId to init client or it can be inferred?
        // sdk.createClient({ baseUrl, accessToken, userId })
    }

    this.set      = this.options.set || "all";
    this.network  = "Matrix";
    
    // Custom logger to suppress FetchHttpApi debug spam
    const silentLogger = {
        debug: () => {}, // Suppress debug
        info: (msg, ...args) => console.info(`[Matrix] ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`[Matrix] ${msg}`, ...args),
        error: (msg, ...args) => console.error(`[Matrix] ${msg}`, ...args),
        trace: () => {},
        getChild: () => silentLogger
    };

    this.client = createClient({
      baseUrl: this.baseUrl,
      accessToken: this.token,
      userId: this.userId,
      logger: silentLogger
    });

    this.server = {
      set: this.set,
      channel: new Map(),
      user: new Map(),
      me: {},
      download: (mxcUrl) => this.download(mxcUrl)
    };

    return (async () => {
        await this.start();
        return this;
    })();
  }

  async start() {
    await this.client.startClient({ initialSyncLimit: 10 });
    
    this.client.once('sync', async (state, prevState, res) => {
        if (state === 'PREPARED') {
            const me = await this.client.getProfileInfo(this.client.getUserId());
            this.server.me = {
                nickname: me.displayname || this.client.getUserId(),
                username: this.client.getUserId(),
                account: this.client.getUserId(),
                prefix: `${this.client.getUserId()}!matrix`, // simplified
                id: this.client.getUserId()
            };
            this.emit("data", ["ready", "matrix"]);

            if (this.options.channels) {
                for (const channel of this.options.channels) {
                    try {
                        await this.client.joinRoom(channel);
                        console.log(`[Matrix] Joined room: ${channel}`);
                    } catch (e) {
                        console.error(`[Matrix] Failed to join room ${channel}:`, e);
                    }
                }
            }
        }
    });

    this.client.on("Room.timeline", (event, room, toStartOfTimeline) => {
        if (toStartOfTimeline) return; 
        
        if (event.getType() !== "m.room.message") return;
        
        // Ignore own messages
        if (event.getSender() === this.client.getUserId()) return;
        
        const content = event.getContent();
        if (!content || !content.body) return;
        
        if (['m.text', 'm.notice', 'm.emote'].indexOf(content.msgtype) === -1) return;

        const age = Date.now() - event.getTs();
        if (age > 60000) return; // Ignore old events (1m)

        // Check if DM (<= 2 members)
        const memberCount = room.getJoinedMemberCount();
        // if (memberCount <= 2) {
             // We can log it if needed, but return early to avoid trigger processing
             // console.log(`[Matrix] Ignoring DM from ${event.getSender()}`);
             // return;
        // }

        (async () => {
            try {
                const msgData = await this.reply(event, room);
                this.emit("data", ["message", msgData]);
            } catch (err) {
                console.error(`[Matrix] Error processing message:`, err);
            }
        })();
    });

    // Error handling?
    // this.client.on("error", ...);
  }

  async reply(event, room) {
    const senderId = event.getSender();
    const senderMember = room.getMember(senderId);
    const senderName = senderMember ? senderMember.name : senderId; // fallback
    
    const content = event.getContent();

    let message = content.body;
    if (content.msgtype === 'm.emote') {
        message = `* ${senderName} ${message}`; 
    }

    // Handle replies
    let replyTo = null;
    const relation = content['m.relates_to'];

    if (relation && relation['m.in_reply_to']) {
        const relatedEventId = relation['m.in_reply_to'].event_id;
        try {
            let relatedEvent = room.findEventById(relatedEventId);
            
            if (!relatedEvent) {
                try {
                    const fetched = await this.client.fetchRoomEvent(room.roomId, relatedEventId);
                    if (fetched.getContent) {
                        relatedEvent = fetched;
                    } else {
                        // Create a mock object if it's raw JSON
                        relatedEvent = {
                            getContent: () => fetched.content,
                            getSender: () => fetched.sender,
                            getType: () => fetched.type
                        };
                    }
                } catch (fetchErr) {
                    console.error(`[Matrix] Failed to fetch remote event ${relatedEventId}:`, fetchErr);
                }
            }

            if (relatedEvent) {
                const relatedContent = relatedEvent.getContent();
                const isMedia = ['m.image', 'm.video', 'm.audio', 'm.file'].includes(relatedContent.msgtype);
                let mediaUrl = null;
                let mxcUrl = null;
                if (isMedia && relatedContent.url) {
                    mxcUrl = relatedContent.url;
                    mediaUrl = this.client.mxcUrlToHttp(relatedContent.url);
                }
                
                replyTo = {
                    sender: relatedEvent.getSender(),
                    message: relatedContent.body,
                    url: mediaUrl,
                    mxcUrl: mxcUrl,
                    type: relatedContent.msgtype,
                    filename: relatedContent.filename || relatedContent.body // fallback to body if filename missing
                };
            }
        } catch (e) {
            console.warn(`[Matrix] Failed to resolve reply event ${relatedEventId}:`, e);
        }
    }

    return {
      type: "matrix",
      network: "Matrix",
      channel: room.name || "Room",
      channelid: room.roomId,
      user: {
        prefix: `${senderId}!${senderId}`,
        nick: senderName,
        username: senderId, // Matrix users are defined by ID usually
        account: senderId
      },
      message: message,
      replyTo: replyTo,
      time: ~~(event.getTs() / 1000),
      raw: event,
      self: this.server,
      reply: (msg) => this.send(room.roomId, this.format(msg)),
      replyAction: (msg) => this.send(room.roomId, this.format(msg), "emote"),
      replyNotice: (msg) => this.send(room.roomId, this.format(msg), "notice")
    };
  }

  async download(mxcUrl) {
      if (!mxcUrl) throw new Error("No MXC URL provided");
      
      const accessToken = this.client.getAccessToken();
      if (!accessToken) console.warn("[Matrix] No access token available for download!");

      const tryDownload = async (url) => {
         const res = await fetch(url, {
              headers: {
                  "Authorization": `Bearer ${accessToken}`
              }
          });
          if (!res.ok) {
              const errText = await res.text();
              throw new Error(`HTTP Error ${res.status}: ${res.statusText} - ${errText}`);
          }
          return await res.arrayBuffer();
      }

      try {
          // Parse MXC
          const cleanMxc = mxcUrl.replace('mxc://', '');
          const [serverName, mediaId] = cleanMxc.split('/');

          if (!serverName || !mediaId) {
              throw new Error(`Invalid MXC URL format: ${mxcUrl}`);
          }

          // Strategy 1: Authenticated Client API (MSC3916 / Matrix 1.11+)
          const baseUrl = this.client.baseUrl; 
          const authUrl = `${baseUrl}/_matrix/client/v1/media/download/${serverName}/${mediaId}`;
          
          try {
             const ab = await tryDownload(authUrl);
             return Buffer.from(ab);
          } catch (e1) {
             // console.warn(`[Matrix] Authenticated Client API failed: ${e1.message}`);
          }

          // Strategy 2: Legacy Media API (v3) with Auth
          const v3Url = `${baseUrl}/_matrix/media/v3/download/${serverName}/${mediaId}`;
          try {
             const ab = await tryDownload(v3Url);
             return Buffer.from(ab);
          } catch (e2) {
             // console.warn(`[Matrix] Legacy v3 API failed: ${e2.message}`);
          }

          throw new Error("All download strategies failed.");
      } catch (e) {
          console.error(`[Matrix] Download failed:`, e);
          throw e;
      }
  }

  format(msg) {
      if (typeof msg === 'object') return msg; // Should probably be stringified or handled?
      // simple bbcode to markdown/html or just strip?
      // Matrix supports HTML. 
      // Reuse logic from others if needed, but for now simple replacement
      return msg.toString()
        .replace(/\[b\](.*?)\[\/b\]/g, "**$1**")
        .replace(/\[i\](.*?)\[\/i\]/g, "*$1*");
  }

  async send(roomId, msg, type = "text") {
    let content = {
        msgtype: "m.text",
        body: ""
    };

    if (type === 'emote') content.msgtype = 'm.emote';
    if (type === 'notice') content.msgtype = 'm.notice';

    if (typeof msg === 'object') {
        content.body = msg.body || JSON.stringify(msg);
        if (msg.formatted_body) {
            content.format = "org.matrix.custom.html"; 
            content.formatted_body = msg.formatted_body;
        }
    } else {
        // String handling
        content.body = msg.toString();
        // Simple auto-formatting check
        if (content.body.includes('**') || content.body.includes('*')) {
            content.format = "org.matrix.custom.html";
            content.formatted_body = content.body
                .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
                .replace(/\*(.*?)\*/g, "<i>$1</i>");
        }
    }

    try {
        // Ensure roomId is valid
        if (!roomId) throw new Error("No roomId provided for send");
        
        await this.client.sendEvent(roomId, "m.room.message", content, "");
    } catch (e) {
        console.error("[Matrix] Failed to send message:", e);
    }
  }

  async sendmsg(mode, recipient, msg) {
      if (recipient.startsWith('@')) {
          console.log(`[Matrix] Sending DM to ${recipient}`);
          try {
              // Try to find existing DM
              // Note: implementation details vary by SDK version, simplified approach:
              const accountData = this.client.getAccountData('m.direct');
              let roomId;
              
              if (accountData) {
                  const directRooms = accountData.getContent();
                  const rooms = directRooms[recipient];
                  if (rooms && rooms.length > 0) {
                      roomId = rooms[0]; // Pick first one
                      // Check if we are still in it? Assumed yes for now.
                  }
              }

              if (!roomId) {
                  // Create new DM
                  const createOpts = {
                      visibility: "private",
                      invite: [recipient],
                      is_direct: true
                  };
                  const result = await this.client.createRoom(createOpts);
                  roomId = result.room_id;

                  // Manually update m.direct to ensure we remember this room for this user
                  if (roomId) {
                      try {
                          const newDirects = accountData ? accountData.getContent() : {};
                          const userRooms = newDirects[recipient] || [];
                          if (!userRooms.includes(roomId)) {
                              userRooms.push(roomId);
                              newDirects[recipient] = userRooms;
                              await this.client.setAccountData('m.direct', newDirects);
                              console.log(`[Matrix] Updated m.direct for ${recipient} with ${roomId}`);
                          }
                      } catch (err) {
                          console.error(`[Matrix] Failed to update m.direct:`, err);
                      }
                  }
              }
              
              if (roomId) {
                  await this.send(roomId, msg);
              }
          } catch(e) {
              console.error(`[Matrix] Failed to send DM to ${recipient}:`, e);
          }
          return;
      }

      // recipient should be a roomId for channel/room messages
      await this.send(recipient, msg);
  }
}
