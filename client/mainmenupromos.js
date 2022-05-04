const path = require( "path" )
const fs = require( "fs" )

const { getRatelimit } = require( "../shared/ratelimit.js" )

let promodataPath = path.join( __dirname, "mainmenupromodata.json" )

// watch the mainmenupromodata file so we can update it without a masterserver restart
if( fs.existsSync( promodataPath ) )
{
	// eslint-disable-next-line
	fs.watch( promodataPath, ( curr, prev ) =>
	{
		try
		{
			mainMenuPromoData = JSON.parse( fs.readFileSync( promodataPath ).toString() )
			console.log( "updated main menu promo data successfully!" )
		}
		catch ( ex )
		{
			console.log( `encountered error updating main menu promo data: ${ ex }` )
		}

	} )
}
else
{
	console.log( "no main menu promo data found! restart required to update" )
}

let mainMenuPromoData = {}
if ( fs.existsSync( promodataPath ) )
	mainMenuPromoData = JSON.parse( fs.readFileSync( promodataPath ).toString() )

module.exports = ( fastify, opts, done ) =>
{
	// exported routes

	// GET /client/mainmenupromos
	// returns main menu promo info
	fastify.get( "/client/mainmenupromos",
		{
			config: { rateLimit: getRatelimit( "REQ_PER_MINUTE__CLIENT_MAINMENUPROMOS" ) }, // ratelimit
		},
		async ( ) =>
		{
			return mainMenuPromoData
		} )

	done()
}
