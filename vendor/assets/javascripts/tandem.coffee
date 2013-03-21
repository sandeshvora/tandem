#= require async
#= require underscore
#= require socket.io
#= require eventemitter2
#= require tandem-core
#= require_tree ./tandem

window.Tandem or= {}
window.Tandem.Client = require('tandem/tandem')
window.Tandem.Engine = require('tandem/engine')
window.Tandem.File = require('tandem/file')
window.Tandem.NetworkAdapter = require('tandem/network')