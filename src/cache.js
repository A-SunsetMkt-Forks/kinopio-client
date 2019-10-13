// local storage cache interface for currentUser and spaces

import nanoid from 'nanoid'

import utils from '@/utils.js'

export default {
  storeLocal (key, value) {
    try {
      window.localStorage[key] = JSON.stringify(value)
    } catch (error) {
      console.warn('Could not save to localStorage. (localStorage is disabled in private Safari windows)')
    }
  },
  getLocal (key) {
    try {
      return JSON.parse(window.localStorage[key])
    } catch (error) {}
  },
  removeLocal (key) {
    try {
      window.localStorage.removeItem(key)
    } catch (error) {}
  },
  removeAll () {
    window.localStorage.clear()
  },

  // User

  user () {
    return this.getLocal('user') || {}
  },
  updateUser (key, value) {
    let user = this.user()
    user[key] = value
    this.storeLocal('user', user)
  },
  saveUser (user) {
    this.storeLocal('user', user)
  },

  // Space

  space (spaceId) {
    return this.getLocal(`space-${spaceId}`) || {}
  },
  getAllSpaces () {
    const keys = Object.keys(window.localStorage)
    const spaceKeys = keys.filter(key => key.startsWith('space-'))
    const spaces = spaceKeys.map(key => {
      return this.getLocal(key)
    })
    const spacesWithNames = spaces.map(space => {
      space.name = space.name || `space-${space.id}`
      return space
    })
    const sortedSpaces = spacesWithNames.sort((a, b) => {
      return b.cacheDate - a.cacheDate
    })
    return sortedSpaces
  },
  updateSpace (key, value, spaceId) {
    let space = this.space(spaceId)
    space[key] = value
    space.cacheDate = Date.now()
    this.storeLocal(`space-${spaceId}`, space)
  },
  addToSpace ({ cards, connections, connectionTypes }, spaceId) {
    let space = this.space(spaceId)
    cards.forEach(card => space.cards.push(card))
    connections.forEach(connection => space.connections.push(connection))
    connectionTypes.forEach(connectionType => space.connectionTypes.push(connectionType))
    this.storeLocal(`space-${spaceId}`, space)
  },
  // Added aug 2019, can safely remove this in aug 2020
  updateBetaSpaceId (newId) {
    const updatedSpace = this.space('1')
    updatedSpace.id = newId
    this.storeLocal(`space-${newId}`, updatedSpace)
    this.removeLocal('space-1')
  },
  saveSpace (space) {
    space.cacheDate = Date.now()
    this.storeLocal(`space-${space.id}`, space)
  },
  updateIdsInAllSpaces () {
    let spaces = this.getAllSpaces()
    spaces.map(space => {
      this.updateIdsInSpace(space)
    })
  },
  updateIdsInSpace (space) {
    const cardIdDeltas = []
    const connectionTypeIdDeltas = []
    space.cards = space.cards.map(card => {
      const newId = nanoid()
      cardIdDeltas.push({
        prevId: card.id,
        newId
      })
      card.id = newId
      return card
    })
    space.connectionTypes = space.connectionTypes.map(type => {
      const newId = nanoid()
      connectionTypeIdDeltas.push({
        prevId: type.id,
        newId
      })
      type.id = newId
      return type
    })
    space.connections = space.connections.map(connection => {
      connection.id = nanoid()
      connection.connectionTypeId = utils.updateAllIds(connection, 'connectionTypeId', connectionTypeIdDeltas)
      connection.startCardId = utils.updateAllIds(connection, 'startCardId', cardIdDeltas)
      connection.endCardId = utils.updateAllIds(connection, 'endCardId', cardIdDeltas)
      return connection
    })
    this.storeLocal(`space-${space.id}`, space)
    return space
  },
  updateCurrentUserSpaces (newSpaces) {
    newSpaces.forEach(newSpace => {
      const space = {
        id: newSpace.id,
        name: newSpace.name,
        cacheDate: new Date(newSpace.userSpace.updatedAt).getTime()
      }
      if (this.space(newSpace.id)) {
        this.updateSpace('name', newSpace.name, newSpace.id)
      } else {
        this.storeLocal(`space-${newSpace.id}`, space)
      }
    })
  },

  // Removed Spaces

  removedSpace (spaceId) {
    return this.getLocal(`space-${spaceId}`) || {}
  },
  removeSpace (spaceId) {
    this.updateSpace('removeDate', Date.now(), spaceId)
    const spaceKey = `space-${spaceId}`
    const space = this.getLocal(spaceKey)
    this.storeLocal(`removed-${spaceKey}`, space)
    this.removeLocal(spaceKey)
  },
  removeRemovedSpace (spaceId) {
    const spaceKey = `removed-space-${spaceId}`
    this.removeLocal(spaceKey)
  },
  restoreSpace (spaceId) {
    const spaceKey = `removed-space-${spaceId}`
    const space = this.getLocal(spaceKey)
    this.storeLocal(`space-${spaceId}`, space)
    this.removeLocal(spaceKey)
  },
  getAllRemovedSpaces () {
    const keys = Object.keys(window.localStorage)
    const spaceKeys = keys.filter(key => key.startsWith('removed-space-'))
    const spaces = spaceKeys.map(key => {
      return this.getLocal(key)
    })
    const sortedSpaces = spaces.sort((a, b) => {
      return b.removeDate - a.removeDate
    })
    return sortedSpaces
  },

  // API Queue

  queue () {
    return this.getLocal('queue') || []
  },
  saveQueue (queue) {
    this.storeLocal('queue', queue)
  }

}
