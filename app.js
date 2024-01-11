const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at 3000')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

//Login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
  SELECT * 
  FROM 
  user 
  WHERE 
  username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const states = statesList => {
  return {
    stateId: statesList.state_id,
    stateName: statesList.state_name,
    population: statesList.population,
  }
}

//Get states API
app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT * FROM 
    state
    ORDER BY
    state_id`

  const statesArray = await db.all(getStatesQuery)
  response.send(statesArray.map(eachState => states(eachState)))
})

//Get state by stateId
app.get('/states/:stateId', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateByIdQuery = `
    SELECT * FROM 
    state
    WHERE
    state_id = ${stateId}`

  const stateByIdArray = await db.get(getStateByIdQuery)
  response.send(states(stateByIdArray))
})

//Add district API
app.post('/districts/', authenticateToken, async (request, response) => {
  const districtDetails = request.body
  const {districtName, stateId, cases, cured, active, deaths} = districtDetails

  const addDistrictQuery = `
  INSERT INTO 
  district (district_name, state_id, cases, cured, active, deaths) 
  VALUES ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths})`

  await db.run(addDistrictQuery)
  response.send('District Successfully Added')
})

//Get district by districtId
const districts = objectDb => {
  return {
    districtId: objectDb.district_id,
    districtName: objectDb.district_name,
    stateId: objectDb.state_id,
    cases: objectDb.cases,
    cured: objectDb.cured,
    active: objectDb.active,
    deaths: objectDb.deaths,
  }
}
app.get(
  '/districts/:districtId',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictByIdQuery = `
  SELECT * 
  FROM 
  district 
  WHERE 
  district_id = ${districtId}`

    const districtByIdArray = await db.get(getDistrictByIdQuery)
    response.send(districts(districtByIdArray))
  },
)

//Delete district API
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
  DELETE 
  FROM 
  district 
  WHERE 
  district_id = ${districtId}`

    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

//Update district by districtId
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body

    const updateDistrictQuery = `
  UPDATE district 
  SET 
  district_name = '${districtName}', state_id = ${stateId}, cases = ${cases}, 
  cured = ${cured}, active = ${active}, deaths = ${deaths}
  WHERE district_id = ${districtId}`

    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

//Get total details of state by stateId
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params

    const getstatsByStateIdQuery = `
  SELECT 
    SUM(cases) AS totalCases,
    SUM(cured) AS totalCured,
    SUM(active) AS totalActive,
    SUM(deaths) AS totalDeaths 
  FROM 
    district 
  WHERE 
    state_id = ${stateId}`

    const totalStatsArray = await db.get(getstatsByStateIdQuery)
    response.send(totalStatsArray)
  },
)

module.exports = app
