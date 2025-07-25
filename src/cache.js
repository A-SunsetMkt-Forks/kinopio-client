// local storage cache interface for currentUser and spaces

import debounce from 'lodash-es/debounce'
import * as idb from 'idb-keyval'
import { stringify, parse } from 'flatted'

import utils from '@/utils.js'

const updateErrorMessage = '🚑 could not updateSpace cache because cachedSpace does not exist (ignore if space is read-only or open)'
let showDebugMessages = false

export default {
  async migrateFromLocalStorage () {
    const lsKeys = Object.keys(window.localStorage)
    let idbKeys = await idb.keys()
    if (idbKeys.length) { return }
    // port keys
    for (const lsKey of lsKeys) {
      let lsValue = window.localStorage[lsKey]
      if (utils.isStringJSON(lsValue)) {
        lsValue = JSON.parse(lsValue)
      }
      await idb.set(lsKey, lsValue)
    }
    idbKeys = await idb.keys()
    console.info('🥂 migrated from ls to idb', lsKeys, idbKeys)
  },
  async saveLocal (key, value) {
    try {
      if (showDebugMessages) {
        console.info('🏬 saveLocal', key, value)
      }
      await idb.set(key, value)
    } catch (error) {
      showDebugMessages = true
      console.error('🚒 saveLocal could not save to idb', { key, value, valueType: typeof value }, error)
      this.notifyCouldNotSave()
      this.pruneLocal()
    }
  },
  notifyCouldNotSave () {
    window.globalStore.triggerNotifyCouldNotSave()
  },
  async pruneLocal () {
    const user = await this.user()
    if (user?.apiKey) {
      const currentSpaceId = utils.spaceIdFromUrl()
      if (!currentSpaceId) {
        console.error('🚒 prune error could not get currentSpaceId', currentSpaceId)
        this.notifyCouldNotSave()
        return
      }
      const keys = await idb.keys()
      let spaceKeys = keys.filter(key => {
        const isSpace = key.startsWith('space-') || key.startsWith('removed-space-')
        return isSpace
      })
      spaceKeys = spaceKeys.filter(key => key !== `space-${currentSpaceId}`)
      console.info('🍾 pruning idb spaces', {
        currentSpaceId,
        keys,
        spaceKeysToRemove: spaceKeys
      })
      for (const key of spaceKeys) {
        await this.removeLocal(key)
      }
      // await idb.delMany(spaceKeys)
      const newKeys = await idb.keys()
      console.info('🥂 pruned idb spaces', {
        prevKeys: keys.length,
        newKeys
      })
    }
    this.notifyCouldNotSave()
  },
  async getLocal (key) {
    try {
      const item = await idb.get(key)
      return item
    } catch (error) {}
  },
  async removeLocal (key) {
    try {
      await idb.del(key)
    } catch (error) {
      console.warn('removeLocal', error)
    }
  },
  async removeAll () {
    const keys = await idb.keys()
    for (const key of keys) {
      await this.removeLocal(key)
    }
    console.info('🚑 idb cleared', keys)
    localStorage.clear()
    console.info('🚑 ls cleared')
  },

  // User

  async user () {
    const user = await this.getLocal('user')
    return user || {}
  },
  async updateUser (update) {
    let user = await this.user()
    user = utils.normalizeToObject(user)
    const updatedUser = { ...user, ...update }
    await this.saveLocal('user', updatedUser)
  },
  async saveUser (user) {
    user = utils.clone(user)
    await this.saveLocal('user', user)
  },

  // Space

  async space (spaceId) {
    if (!spaceId) { return {} }
    let space = await this.getLocal(`space-${spaceId}`) || {}
    space = utils.normalizeToObject(space)
    space.clients = []
    return space
  },
  async getInboxSpace () {
    const spaces = await this.getAllSpaces()
    return spaces.find(space => space.name === 'Inbox')
  },
  async getSpaceByName (name) {
    const spaces = await this.getAllSpaces()
    return spaces.find(space => space.name === name)
  },
  async getAllSpaces () {
    const keys = await idb.keys()
    const spaceKeys = keys.filter(key => key.startsWith('space-'))
    const spaces = []
    for (const key of spaceKeys) {
      const space = await this.getLocal(key)
      spaces.push(space)
    }
    let spacesWithNames = spaces.map(space => {
      space = utils.normalizeToObject(space)
      if (!space) { return }
      space.name = space.name || `space-${space.id}`
      return space
    })
    spacesWithNames = spacesWithNames.filter(space => Boolean(space))
    const sortedSpaces = spacesWithNames.sort((a, b) => {
      return b.cacheDate - a.cacheDate
    })
    return sortedSpaces
  },

  async updateSpaceByUpdates (updates, spaceId) {
    const keys = Object.keys(updates)
    for (const key of keys) {
      await this.updateSpace(key, updates[key], spaceId)
    }
  },
  async updateSpace (key, value, spaceId) {
    const space = await this.space(spaceId)
    if (!utils.objectHasKeys(space)) {
      console.warn(updateErrorMessage)
      return
    }
    const normalizeKeys = ['cards', 'connections', 'connectionTypes', 'boxes']
    if (normalizeKeys.includes(key)) {
      value = utils.denormalizeItems(value)
    }
    space[key] = value
    space.clients = []
    space.cacheDate = Date.now()
    await this.saveSpace(space)
  },
  updateSpaceCardsDebounced: debounce(async function (cards, spaceId) {
    cards = utils.denormalizeItems(cards)
    const space = await this.space(spaceId)
    if (!utils.objectHasKeys(space)) {
      console.warn(updateErrorMessage)
      return
    }
    cards = utils.denormalizeItems(cards)
    space.cards = cards
    space.cacheDate = Date.now()
    await this.saveSpace(space)
  }, 200),
  updateSpaceConnectionsDebounced: debounce(async function (connections, spaceId) {
    connections = utils.denormalizeItems(connections)
    const space = await this.space(spaceId)
    if (!utils.objectHasKeys(space)) {
      console.warn(updateErrorMessage)
      return
    }
    space.connections = connections
    space.cacheDate = Date.now()
    await this.saveSpace(space)
  }, 200),
  updateSpaceBoxesDebounced: debounce(async function (boxes, spaceId) {
    boxes = utils.denormalizeItems(boxes)
    const space = await this.space(spaceId)
    if (!utils.objectHasKeys(space)) {
      console.warn(updateErrorMessage)
      return
    }
    boxes = utils.denormalizeItems(boxes)
    space.boxes = boxes
    space.cacheDate = Date.now()
    await this.saveSpace(space)
  }, 200),

  async addToSpace ({ cards, connections, connectionTypes, boxes }, spaceId) {
    // space items
    const space = await this.space(spaceId)
    space.cards = space.cards || []
    space.connections = space.connections || []
    space.connectionTypes = space.connectionTypes || []
    space.boxes = space.boxes || []
    // new items
    cards = cards || []
    connections = connections || []
    connectionTypes = connectionTypes || []
    boxes = boxes || []
    // add new items
    cards.forEach(card => space.cards.push(card))
    connections.forEach(connection => space.connections.push(connection))
    connectionTypes.forEach(connectionType => space.connectionTypes.push(connectionType))
    boxes.forEach(box => space.boxes.push(box))
    await this.saveSpace(space)
  },
  async saveSpace (space) {
    if (!space) { return }
    try {
      space = parse(stringify(space)) // removes functions and circular references from object
      if (!space.id) {
        console.warn('☎️ error caching space. This is expected if currentUser is read only', space)
        return
      }
      space.cacheDate = Date.now()
      await this.saveLocal(`space-${space.id}`, space)
    } catch (error) {
      console.error('🚒 saveSpace', space, error)
    }
  },
  async updateIdsInSpace (space, nullCardUsers) {
    const items = {
      cards: space.cards,
      connectionTypes: space.connectionTypes,
      connections: space.connections,
      tags: space.tags,
      boxes: space.boxes
    }
    const uniqueItems = await utils.uniqueSpaceItems(items, nullCardUsers)
    space.cards = uniqueItems.cards.map(card => {
      card.spaceId = space.id
      return card
    })
    space.connectionTypes = uniqueItems.connectionTypes
    space.connections = uniqueItems.connections
    space.tags = uniqueItems.tags.map(tag => {
      tag.spaceId = space.id
      return tag
    })
    space.boxes = uniqueItems.boxes
    await this.saveSpace(space)
    return space
  },
  async addSpaces (spaces) {
    for (const space of spaces) {
      space.cacheDate = utils.unixTime(space.updatedAt)
      await this.saveSpace(space)
    }
  },

  // Removed Spaces

  async removeSpace (space) {
    await this.updateSpace('removeDate', Date.now(), space.id)
    const spaceKey = `space-${space.id}`
    space = await this.getLocal(spaceKey)
    await this.saveLocal(`removed-${spaceKey}`, space)
    await this.removeLocal(spaceKey)
  },
  async deleteSpace (space) {
    await this.removeLocal(`removed-space-${space.id}`)
    await this.removeLocal(`space-${space.id}`)
  },
  async restoreRemovedSpace (space) {
    const spaceKey = `removed-space-${space.id}`
    space = await this.getLocal(spaceKey)
    if (!space) { return }
    await this.saveSpace(space)
    await this.removeLocal(spaceKey)
  },
  async getAllRemovedSpaces () {
    const keys = await idb.keys()
    const spaceKeys = keys.filter(key => key.startsWith('removed-space-'))
    const spaces = []
    for (const key of spaceKeys) {
      const space = await this.getLocal(key)
      spaces.push(space)
    }
    let sortedSpaces = spaces.sort((a, b) => {
      return b.removeDate - a.removeDate
    })
    sortedSpaces = sortedSpaces.filter(space => Boolean(space))
    return sortedSpaces
  },

  // Groups

  async groups () {
    const groups = await this.getLocal('groups')
    return groups || {}
  },
  async saveGroups (groups) {
    groups = utils.clone(groups)
    groups = utils.denormalizeItems(groups)
    await this.saveLocal('groups', groups)
  },

  // Tags

  async allCardsByTagName (name) {
    const spaces = await this.getAllSpaces()
    const cards = [] // card name, id, spaceid
    spaces.forEach(space => {
      if (!space.tags) { return }
      const tags = space.tags.filter(tag => tag.name === name)
      if (!utils.arrayHasItems(tags)) { return }
      const cardIds = tags.map(tag => tag.cardId)
      space.cards.forEach(card => {
        if (cardIds.includes(card.id)) {
          card.spaceName = space.name
          cards.push(card)
        }
      })
    })
    return cards
  },
  async allTags () {
    const spaces = await this.getAllSpaces()
    const tags = []
    spaces.forEach(space => {
      if (utils.arrayHasItems(space.tags)) {
        space.tags.forEach(tag => tags.push(tag))
      }
    })
    tags.reverse()
    return tags
  },
  async updateTagColorInAllSpaces (tag) {
    const spaces = await this.getAllSpaces()
    for (const space of spaces) {
      if (!space.tags) { return }
      const newSpaceTags = space.tags.map(spaceTag => {
        if (spaceTag.name === tag.name) {
          spaceTag.color = tag.color
        }
        return spaceTag
      })
      await this.updateSpace('tags', newSpaceTags, space.id)
    }
  },
  async removeTagsByNameInAllSpaces (tag) {
    const spaces = await this.getAllSpaces()
    for (const space of spaces) {
      if (!space.tags) { return }
      const newSpaceTags = space.tags.filter(spaceTag => spaceTag.name !== tag.name)
      await this.updateSpace('tags', newSpaceTags, space.id)
    }
  },

  // Add Page

  async prevAddPageValue () {
    const value = await idb.get('prevAddPageValue') || ''
    return value
  },
  async updatePrevAddPageValue (value) {
    await this.saveLocal('prevAddPageValue', value)
  },
  async clearPrevAddPageValue (value) {
    await this.saveLocal('prevAddPageValue', '')
  },

  // API Queue

  async queue () {
    const queue = await this.getLocal('queue')
    return queue || []
  },
  async saveQueue (queue) {
    await this.saveLocal('queue', queue)
  },
  async clearQueue () {
    await idb.update('queue', (value) => [])
  },

  // API Sending in Progress Queue
  // queue items are moved here at api.sendQueue

  // async sendingQueue () {
  //   const queue = await this.getLocal('sendingQueue')
  //   return queue || []
  // },
  // async saveSendingQueue (queue) {
  //   await this.saveLocal('sendingQueue', queue)
  // },
  // async clearSendingQueue () {
  //   await this.saveLocal('sendingQueue', [])
  // },

  // Invited Spaces

  async invitedSpaces () {
    const spaces = await this.getLocal('invitedSpaces')
    return spaces || []
  },
  async saveInvitedSpace (space) {
    space = {
      id: space.id,
      name: space.name,
      users: space.users,
      collaboratorKey: space.collaboratorKey,
      updatedAt: space.updatedAt,
      cacheDate: Date.now()
    }
    let invitedSpaces = await this.invitedSpaces()
    invitedSpaces = invitedSpaces.filter(invitedSpace => {
      return invitedSpace.id !== space.id
    })
    invitedSpaces.push(space)
    await this.saveLocal('invitedSpaces', invitedSpaces)
  },
  async removeInvitedSpace (space) {
    let invitedSpaces = await this.invitedSpaces()
    invitedSpaces = invitedSpaces.filter(invitedSpace => {
      return invitedSpace.id !== space.id
    })
    await this.saveLocal('invitedSpaces', invitedSpaces)
  },

  // Changelog

  async prevReadChangelogId () {
    const value = await idb.get('prevReadChangelogId')
    return value || ''
  },
  async updatePrevReadChangelogId (id) {
    await this.saveLocal('prevReadChangelogId', id)
  },

  // emoji

  async emojis () {
    const emojis = await this.getLocal('emojis')
    return emojis || []
  },
  async updateEmojis ({ emojis, version }) {
    await this.saveLocal('emojis', emojis)
    await this.saveLocal('emojiUnicodeVersion', version)
  }
}
