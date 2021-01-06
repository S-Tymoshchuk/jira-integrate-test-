require('dotenv').config()
const OAuth = require('oauth').OAuth
const express = require('express')
const session = require('express-session')
const config = require('./config')
const { mongooseConnect } = require('./mongoosse')
const KeysAccess = require('./test.schema')
const fetch = require('node-fetch')
const privateKeyData = '-----BEGIN RSA PRIVATE KEY-----\n' +
  'MIICXQIBAAKBgQCYr7wFejW3oU7eyuwVX6RERC+RbVZaMw2jMjMvwqcxKZRmNGre\n' +
  '+CBDcp9KdNSCnhE/1zpZEzbLBBBG+rjWyKNLyfr528dvWlK4uXU+YGxVm0Q8yAm5\n' +
  '89rehkoheKxvZ5tvUvJHbwYfdC+jd3GV6pRLvQ6X3mriTsjjcF8wk1iEMwIDAQAB\n' +
  'AoGBAIwQUWOY6yQLhoVcEtu8g7zX6+b1LMzLnowBZfE/GA5CPU7QcOUfKsGUqUkt\n' +
  'CTDU/a/ZqT3DIXV0wdXK87qcDSbzVynOT4eCHEoVHhiBXBOZVHRXrR3xKBG+0A3O\n' +
  'W86xLk5w0BnlDN+yzqYmAsMS0nJQCYD0qvf6s/wFCE9j0DTJAkEAyRZB3C6wjLdL\n' +
  'STQZ3pkVbsyVUF8dn8t4JZSEfoURmb2Kv5EzjeRZD6CBcPfrrqlSU3Pat6+OE5+O\n' +
  'iVx28gpV1QJBAMJh29VmiHygCc+5GBNQOJv/ncZyIq/VUow4hWOdUaWhfvG42Fg2\n' +
  'zZp0NVePiOtkh2RvjVFmQoFp6tJORuVkTecCQQCPNz7o5ofvcIw6MtVJ6JWPOD4P\n' +
  '4+5hZLTJbyF+Sp/ic1BiZ7PkFwInUxVds/UzjHyJ2zWnJW13JGiMBELi1+GRAkB9\n' +
  'htiCHO6zHF55qFwlzL5h71aiGn7P8gCW0MFDLQrW3U2vJ+F+RhXMUpNH8kdHS+or\n' +
  'L+ag1FrKW+3q1eXuqTGtAkB3cWszo19Uyk7YSJjbOrbqlokwe38h5ihwrMfdl/Fz\n' +
  'KjNbqhi9y1xXUl1s6hhCg78xVWzueLMbGQJJVSrpyKIo\n' +
  '-----END RSA PRIVATE KEY-----'
const consumerKey = config['consumerKey']
const signatureMethod = 'RSA-SHA1'
const oauthVersion = '1.0'

const oauthUrl = `${config.jiraUrl}/plugins/servlet/oauth/`
const protectedResource = `${config.jiraUrl}/rest/api/2/project`
const port = process.env.PORT || 3000
const callbackUrl = `http://localhost:${port}/callback`

// monkey-patch OAuth.get:
// In oauth library code, OAuth.get calls _performSecureRequest with next-to-last argument null ,
// which results is content-type defaulting to "application/x-www-form-urlencoded",
// Jira requires "application/json" hence it is explicitly passed

OAuth.prototype.get = function (url, oauth_token, oauth_token_secret, callback, post_content_type) {
  return this._performSecureRequest(oauth_token, oauth_token_secret, 'GET', url, null, '', post_content_type, callback)
}

OAuth.prototype.post = function (url, oauth_token, oauth_token_secret, callback, body, post_content_type) {
  return this._performSecureRequest(oauth_token, oauth_token_secret, 'POST', url, null, body, post_content_type, callback)
}
// end monkey-patch

const consumer = new OAuth(
  `${oauthUrl}request-token`,
  `${oauthUrl}access-token`,
  consumerKey,
  privateKeyData,
  oauthVersion,
  callbackUrl,
  signatureMethod
)

const app = module.exports = express()
/*app.use(session({
  secret: 'ssshhhh!',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}))
app.use((req, res, next) => {
  res.session = req.session
  next()
})*/

app.get('/', (request, response) => response.send('ok'))
app.get('/connect', (request, response) => {
  consumer.getOAuthRequestToken(async (error, oauthToken, oauthTokenSecret) => {
      if (error) {
        response.send('Error getting Request token')
      } else {
        console.log(oauthToken)
        console.log(oauthTokenSecret)
        const keys = await KeysAccess.updateOne({
          workspace: 'test'
        }, {
          $set: {
            oauthToken,
            oauthTokenSecret
          }
        }, { new: true, upsert: true })
        console.log(keys)
        /*request.session.oauthRequestToken = oauthToken
        request.session.oauthRequestTokenSecret = oauthTokenSecret*/
        response.redirect(`${oauthUrl}authorize?oauth_token=${oauthToken}`)
      }
    }
  )
})

app.get('/callback', async (request, response) => {
  const keys = await KeysAccess.findOne({
    workspace: 'test'
  })
  consumer.getOAuthAccessToken(
    keys.oauthToken,
    keys.oauthTokenSecret,
    request.query.oauth_verifier,
    async (error, oauthAccessToken, oauthAccessTokenSecret) => {
      if (error) {
        response.send('error getting Access token')
      } else {
        console.log('CONSUMER KEY: ', consumerKey)
        console.log('TOKEN:', oauthAccessToken)
        console.log('SIGNATURE METHOD: ', signatureMethod, ', OAUTH VERSION: ', oauthVersion)
        console.log('PRIVATE KEY:\n', privateKeyData)

        console.log(oauthAccessToken)
        console.log(oauthAccessTokenSecret)

        await KeysAccess.updateOne({
            workspace: 'test'
          },
          {
            $set: {
              oauthToken: oauthAccessToken,
              oauthAccessTokenSecret: oauthAccessTokenSecret
            }
          })
        const test = await KeysAccess.findOne({
          workspace: 'test'
        })
        consumer.get(protectedResource,
          test.oauthToken,
          test.oauthAccessTokenSecret
          ,
          function (error, data) {
            if (error) throw error
            data = JSON.parse(data)
            console.log(data)
            console.log(`${protectedResource} returned ${data.length} items.`)
            response.send(data)
            /*response.send(`Projects: ${data.map(proj =>
              '<li>key: ' + proj['key'] + ', name:' + proj['name'] + ', id:' + proj['id'] + '<\li>').join('')}`)*/
          },
          'application/json'
        )
      }
    }
  )
})

app.get('/test', async (req, res) => {
  const test = await KeysAccess.findOne({
    workspace: 'test'
  })
  const bodyData = `{
  "fields": {
    "summary": "Main order flow broken",

    "issuetype": {
      "id": "10001"
    },
    "project":{
    "id": "10001"
    }
   }
}`
  consumer.post('http://lobalmax.atlassian.net/rest/api/3/issue',
    test.oauthToken,
    test.oauthAccessTokenSecret, function (error, data) {
      if (error) throw error
      data = JSON.parse(data)
      console.log(data)
      res.send(data)
    }
    , bodyData, 'application/json')
})

app.get('/test2', async (req, res) => {
  const test = await KeysAccess.findOne({
    workspace: 'test'
  })

  consumer.get('http://lobalmax.atlassian.net/rest/api/3/issuetype',
    test.oauthToken,
    test.oauthAccessTokenSecret, function (error, data) {
      if (error) throw error
      data = JSON.parse(data)
      console.log(data)
      res.send(data)
    }
    , 'application/json')
})

mongooseConnect()

app.listen(port)
