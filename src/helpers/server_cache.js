const serverKv = new Map()

module.exports.setServer = (server) => {
  if (!server || typeof server.id === 'undefined') return

  serverKv.set(server.id, server)
  return server.id
}

module.exports.getServer = (id) => serverKv.get(id)
