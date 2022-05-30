const crypto = require( "crypto" )
const { GetGameServers } = require( "../shared/gameserver_base" )
const db = require( "../shared/db" )
const asyncHttp = require( "../shared/asynchttp" )
const { minimumVersion } = require( "../shared/version" )
const { getUserInfo, getOriginAuthState } = require( "../shared/origin" )

let shouldRequireSessionToken = ( process.env.REQUIRE_SESSION_TOKEN != undefined ? process.env.REQUIRE_SESSION_TOKEN : true )

const { getRatelimit } = require( "../shared/ratelimit" )
const {
	STRYDER_RESPONSE,
	UNAUTHORIZED_GAME,
	UNAUTHORIZED_PWD,
	PLAYER_NOT_FOUND,
	INVALID_MASTERSERVER_TOKEN,
	JSON_PARSE_ERROR,
	NO_GAMESERVER_RESPONSE,
	BAD_GAMESERVER_RESPONSE,
	UNSUPPORTED_VERSION,
	MALFORMED_REQUEST,
	REUSED_GAME_TOKEN
} = require( "../shared/errorcodes" )

module.exports = ( fastify, opts, done ) =>
{
	// exported routes

	// GET client/origin_auth
	fastify.get( "/client/origin_auth",
		{
			config: { rateLimit: getRatelimit( "REQ_PER_MINUTE__CLIENT_ORIGINAUTH" ) }, // ratelimit
			schema: {
				querystring: {
					id: { type: "string" }, // the authing player's id
					token: { type: "string" } // the authing player's origin token
				}
			}
		},
		async ( request ) =>
		{
			if( !minimumVersion( request ) )
				return { success: false, error: UNSUPPORTED_VERSION }

			// only do this if we're in an environment that actually requires session tokens
			if ( shouldRequireSessionToken )
			{
				if ( request.query.token.includes( "&" ) )
					return { success: false, error: MALFORMED_REQUEST }

				let authResponse
				try
				{
					authResponse = await asyncHttp.request( {
						method: "GET",
						host: "https://r2-pc.stryder.respawn.com",
						port: 443,
						path: `/nucleus-oauth.php?qt=origin-requesttoken&type=server_token&code=${ request.query.token }&forceTrial=0&proto=0&json=1&&env=production&userId=${ parseInt( request.query.id ).toString( 16 ).toUpperCase() }`
					} )
				}
				catch
				{
					return { success: false, error: STRYDER_RESPONSE }
				}

				let authJson
				try
				{
					authJson = JSON.parse( authResponse.toString() )
				}
				catch ( error )
				{
					return { success: false, error: STRYDER_RESPONSE }
				}

				// check origin auth was fine
				// unsure if we can check the exact value of storeUri? doing an includes check just in case
				if ( !authResponse.length || authJson.hasOnlineAccess != "1" /* this is actually a string of either "1" or "0" */ || !authJson.storeUri.includes( "titanfall-2" ) )
					return { success: false, error: UNAUTHORIZED_GAME }
			}

			let playerUsername
			try
			{
				if( getOriginAuthState() ) playerUsername = ( await getUserInfo( request.query.id ) ).EAID[0] // try to find username of player
			}
			catch( e )
			{
				// don't do this: return { success: false } // fail if we can't find it
			}

			let account = await db.AsyncGetPlayerByID( request.query.id )
			if ( !account ) // create account for user
			{
				await db.AsyncCreateAccountForID( request.query.id )
				account = await db.AsyncGetPlayerByID( request.query.id )
			}

			// check token reuse
			if( await db.AsyncHasPlayerUsedGameToken( request.query.id, request.query.token ) )
			{
				return { success: false, error: REUSED_GAME_TOKEN }
			}
			db.AsyncAddPlayerUsedGameToken( request.query.id, request.query.token )

			let authToken = crypto.randomBytes( 16 ).toString( "hex" )
			db.AsyncUpdateCurrentPlayerAuthToken( account.id, authToken )


			if ( playerUsername ) db.AsyncUpdatePlayerUsername( account.id, playerUsername )

			db.AsyncUpdatePlayerAuthIp( account.id, request.ip )

			return {
				success: true,
				token: authToken
			}
		} )

	// POST /client/auth_with_self
	// attempts to authenticate a client with their own server, before the server is created
	// note: atm, this just sends pdata to clients and doesn't do any kind of auth stuff, potentially rewrite later
	fastify.post( "/client/auth_with_self",
		{
			config: { rateLimit: getRatelimit( "REQ_PER_MINUTE__CLIENT_AUTHWITHSELF" ) }, // ratelimit
			schema: {
				querystring: {
					id: { type: "string" }, // id of the player trying to auth
					playerToken: { type: "string" }, // not implemented yet: the authing player's account token
				}
			}
		},
		async ( request ) =>
		{
			if( !minimumVersion( request ) )
				return { success: false, error: UNSUPPORTED_VERSION }

			let account = await db.AsyncGetPlayerByID( request.query.id )
			if ( !account )
				return { success: false, error: PLAYER_NOT_FOUND }

			if ( shouldRequireSessionToken )
			{
				// check token
				const expiredToken = account.currentAuthTokenExpirationTime < Date.now()
				if ( expiredToken || request.query.playerToken != account.currentAuthToken )
					return { success: false, error: INVALID_MASTERSERVER_TOKEN }
			}

			// fix this: game doesnt seem to set serverFilter right if it's >31 chars long, so restrict it to 31
			let authToken = crypto.randomBytes( 16 ).toString( "hex" ).substr( 0, 31 )
			db.AsyncUpdatePlayerCurrentServer( account.id, "self" ) // bit of a hack: use the "self" id for local servers

			return {
				success: true,

				id: account.id,
				authToken: authToken,
				// this fucking sucks, but i couldn't get game to behave if i sent it as an ascii string, so using this for now
				persistentData: Array.from( new Uint8Array( account.persistentDataBaseline ) )
			}
		} )

	// POST /client/auth_with_server
	// attempts to authenticate a client with a gameserver, so they can connect
	// authentication includes giving them a 1-time token to join the gameserver, as well as sending their persistent data to the gameserver
	fastify.post( "/client/auth_with_server",
		{
			config: { rateLimit: getRatelimit( "REQ_PER_MINUTE__CLIENT_AUTHWITHSERVER" ) }, // ratelimit
			schema: {
				querystring: {
					id: { type: "string" }, // id of the player trying to auth
					playerToken: { type: "string" }, // not implemented yet: the authing player's account token
					server: { type: "string" },
					password: { type: "string" } // the password the player is using to connect to the server
				}
			}
		},
		async ( request ) =>
		{
			if( !minimumVersion( request ) )
				return { success: false, error: UNSUPPORTED_VERSION }

			let server = GetGameServers()[ request.query.server ]

			if ( !server || ( server.hasPassword && request.query.password != server.password ) )
				return { success: false, error: UNAUTHORIZED_PWD }

			let account = await db.AsyncGetPlayerByID( request.query.id )
			if ( !account )
				return { success: false, error: PLAYER_NOT_FOUND }

			if ( shouldRequireSessionToken )
			{
				// check token
				const expiredToken = account.currentAuthTokenExpirationTime < Date.now()
				if ( request.query.playerToken != account.currentAuthToken || expiredToken )
					return { success: false, error: INVALID_MASTERSERVER_TOKEN }
			}

			// fix this: game doesnt seem to set serverFilter right if it's >31 chars long, so restrict it to 31
			let authToken = crypto.randomBytes( 16 ).toString( "hex" ).substr( 0, 31 )

			// todo: build persistent data here, rather than sending baseline only
			let pdata = await db.AsyncGetPlayerPersistenceBufferForMods( request.query.id, server.modInfo.Mods.filter( m => !!m.pdiff ).map( m => m.pdiff ) )

			let authResponse
			try
			{
				authResponse = await asyncHttp.request( {
					method: "POST",
					host: server.ip,
					port: server.authPort,
					path: `/authenticate_incoming_player?id=${request.query.id}&authToken=${authToken}&serverAuthToken=${server.serverAuthToken}&username=${encodeURI( account.username )}`
				}, pdata )
			}
			catch
			{
				return { success: false, error: BAD_GAMESERVER_RESPONSE }
			}

			if ( !authResponse )
				return { success: false, error: NO_GAMESERVER_RESPONSE }

			let jsonResponse = JSON.parse( authResponse.toString() )
			if ( !jsonResponse.success )
				return { success: false, error: JSON_PARSE_ERROR }

			// update the current server for the player account
			db.AsyncUpdatePlayerCurrentServer( account.id, server.id )

			return {
				success: true,

				ip: server.ip,
				port: server.port,
				authToken: authToken
			}
		} )

	done()
}
