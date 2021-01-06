const mongoose = require('mongoose');

const keysSchema = new mongoose.Schema({
  workspace:{
    type:String
  },
  oauthToken: {
    type: String,
  },
  oauthTokenSecret: {
    type: String,
  }
});

const Keys = mongoose.model('Keys', keysSchema );
module.exports = Keys;
