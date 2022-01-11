const sqlite = require( "sqlite3" ).verbose()

if ( process.argv.includes( "-devenv" ) )
	require( 'dotenv' ).config({ path: "./dev.env" })
else
	require( 'dotenv' ).config()

let playerDB = new sqlite.Database( process.env.DB_PATH || 'playerdata.db', sqlite.OPEN_CREATE | sqlite.OPEN_READWRITE, async ex => { 
	if ( ex )
		console.error( ex )
	else
		console.log( "Connected to player database successfully" )
	
	// create account table
	// this should mirror the PlayerAccount class's	properties
	playerDB.run( `
	CREATE TABLE IF NOT EXISTS accounts (
		id TEXT PRIMARY KEY NOT NULL,
		currentAuthToken TEXT,
		currentAuthTokenExpirationTime INTEGER,
		currentServerId TEXT,
		persistentDataBaseline BLOB NOT NULL,
		lastModified INTEGER DEFAULT 0
	)
	`, ex => {
		if ( ex )
			console.error( ex )
		else
			console.log( "Created player account table successfully" )
	})

	// create mod persistent data table
	// this should mirror the PlayerAccount class's	properties
	playerDB.run( `
	CREATE TABLE IF NOT EXISTS modPeristentData (
		id TEXT NOT NULL,
		pdiffHash TEXT NOT NULL,
		data TEXT NOT NULL,
		PRIMARY KEY ( id, pdiffHash ),
		lastModified INTEGER DEFAULT 0
	)
	`, ex => {
		if ( ex )
			console.error( ex )
		else
			console.log( "Created mod persistent data table successfully" )
	})

    if( !(await accountsTimestampColumnExists()) ) {
        console.log("Adding column 'lastModified' to accounts")
        accountsAddTimestampColumn()
    }
    if( !(await modPDataTimestampColumnExists()) ) {
        console.log("Adding column 'lastModified' to modPeristentData")
        modPDataAddTimestampColumn()
    }
})

function accountsTimestampColumnExists()
{
	return new Promise( ( resolve, reject ) => {
		playerDB.get( `
        SELECT COUNT(*) AS CNTREC FROM pragma_table_info('accounts') WHERE name='lastModified'
        `, [], ( ex, row ) => {
			if ( ex )
			{
				console.error( "Encountered error querying player database: " + ex )
				reject( ex )
			}
			else
            {
				resolve( row.CNTREC == 1 )
            }
		})
	})
}
function modPDataTimestampColumnExists()
{
	return new Promise( ( resolve, reject ) => {
		playerDB.get( `
        SELECT COUNT(*) AS CNTREC FROM pragma_table_info('modPeristentData') WHERE name='lastModified'
        `, [], ( ex, row ) => {
			if ( ex )
			{
				console.error( "Encountered error querying player database: " + ex )
				reject( ex )
			}
			else
            {
				resolve( row.CNTREC == 1 )
            }
		})
	})
}

function accountsAddTimestampColumn()
{
	return new Promise( ( resolve, reject ) => {
		playerDB.run( `
        ALTER TABLE accounts ADD COLUMN lastModified INTEGER DEFAULT 0
        `, ex => {
            if ( ex )
                console.error( ex )
            else
                console.log( "Added account lastModified column" )
        })
	})
}
function modPDataAddTimestampColumn()
{
	return new Promise( ( resolve, reject ) => {
		playerDB.run( `
        ALTER TABLE modPeristentData ADD COLUMN lastModified INTEGER DEFAULT 0
        `, ex => {
            if ( ex )
                console.error( ex )
            else
                console.log( "Added mod pdata lastModified column" )
        })
	})
}