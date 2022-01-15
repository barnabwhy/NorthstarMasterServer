const { getOwnSyncState } = require('./syncutil.js')
const accounts = require('../shared/accounts.js')
const { GameServer, GetGameServers, AddGameServer, RemoveGameServer, UpdateGameServer } = require("../shared/gameserver.js");
const { setToken, bulkSetTokens } = require('./tokens.js');
const { startSync } = require('./broadcast.js');
module.exports = {
    // eventName: async (data) => {
    //     try { 
    //         EVENT HANDLER
    //     } catch(e) {
    //         if(process.env.USE_DATASYNC_LOGGING) console.log(e)
    //     }
    // }
    syncAccounts: async (data) => {
        try { 
            if(getSyncState() == 2) return;

            let accountList = data.payload.accounts;
            for(let accountJson of accountList) {
                let account = await accounts.AsyncGetPlayerByID( accountJson.id )
                if(accountJson.persistentDataBaseline) accountJson.persistentDataBaseline = Buffer.from(accountJson.persistentDataBaseline)
                if ( !account ) // create account for user
                {
                    if(process.env.USE_DATASYNC_LOGGER) console.log("- Creating account with id \""+accountJson.id+"\"")
                    await accounts.AsyncCreateAccountFromData( accountJson, accountJson.lastModified )
                    account = await accounts.AsyncGetPlayerByID( accountJson.id )
                } else {
                    if(accountJson.lastModified > account.lastModified) {
                        if(process.env.USE_DATASYNC_LOGGER) console.log("- Updating account with id \""+accountJson.id+"\"")
                        accounts.AsyncUpdatePlayer( account.id, accountJson.account, accountJson.lastModified )
                    } else {
                        if(process.env.USE_DATASYNC_LOGGER) console.log("- Skipped account with id \""+accountJson.id+"\" (up-to-date, ts: "+accountJson.lastModified+">="+account.lastModified+")")
                    }
                }
            }
        } catch(e) {
            if(process.env.USE_DATASYNC_LOGGING) console.log(e)
        }
    },
    syncServers: async (data) => {
        try { 
            if(getSyncState() == 2) return;
            
            let servers = data.payload.servers;
            let currentServers = GetGameServers();
            for(let i = 0; i < Object.keys(servers).length; i++) {
                let id = Object.keys(servers)[i]
                if(currentServers[id]) {
                    if(process.env.USE_DATASYNC_LOGGER) console.log("- Updating server with id \""+id+"\"")
                    UpdateGameServer(currentServers[id], servers[id], false)
                } else {
                    if(process.env.USE_DATASYNC_LOGGER) console.log("- Creating server with id \""+id+"\"")
                    let { name, description, playerCount, maxPlayers, map, playlist, ip, port, authPort, password, modInfo, lastHeartbeat, lastModified } = servers[id];
                    let newServer = new GameServer( name, description, playerCount, maxPlayers, map, playlist, ip, port, authPort, password, modInfo, lastHeartbeat )
                    newServer.id = id;
                    newServer.lastHeartbeat = lastHeartbeat;
                    newServer.lastModified = lastModified;
                    AddGameServer(newServer, false)
                }
            }  
        } catch(e) {
            if(process.env.USE_DATASYNC_LOGGING) console.log(e)
        }
    },
    getState: async (data, reply) => {
        try {
            reply('getStateReply', { state: getOwnSyncState() })
        } catch(e) {
            if(process.env.USE_DATASYNC_LOGGING) console.log(e)
        }
    },
    getStateReply: async (data, reply, ws) => {
        try {
            ws.syncState = data.payload.state
        } catch(e) {
            if(process.env.USE_DATASYNC_LOGGING) console.log(e)
        }
    },

    tokenUpdate: async (data, reply) => {
        try { 
            console.log('Token received for '+data.payload.id)
            setToken(data.payload.id, data.payload.tokens[data.payload.id])
            if(data.payload.id == process.env.DATASYNC_OWN_ID) {
                bulkSetTokens(data.payload.tokens);
                startSync()
            }
        } catch(e) {
            if(process.env.USE_DATASYNC_LOGGING) console.log(e)
        }
    },
}