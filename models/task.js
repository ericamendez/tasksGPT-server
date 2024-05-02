const mongoose = require('mongoose')

const uniqueValidator = require('mongoose-unique-validator')

const schema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique: true,
    minlength: 2
  },
  description: {
    type: String,
  },
  priority: {
    type: String,
  },
  status: {
    type: String,
  },
  user: {
    type: String,
    required: true
  },
  complete: {
    type: Boolean
  }
})

schema.plugin(uniqueValidator)

module.exports = mongoose.model('Task', schema)