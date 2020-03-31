import debounce from 'lodash-es/debounce'
import merge from 'lodash-es/merge'

import cache from '@/cache.js'
import utils from '@/utils.js'

let host = 'https://api.kinopio.club'
if (process.env.NODE_ENV === 'development') {
  host = 'http://kinopio.local:3000'
}

const squashQueue = (queue) => {
  let squashed = []
  queue.forEach(request => {
    // check if request has already been squashed
    const isSquashed = squashed.find(item => {
      return item.name === request.name && item.body.id === request.body.id
    })
    if (isSquashed) { return }
    // merge queue items with the same operation name and matching entity id
    const matches = queue.filter(item => {
      return item.name === request.name && item.body.id === request.body.id
    })
    const reduced = matches.reduce((accumulator, currentValue) => merge(accumulator, currentValue))
    reduced.name = request.name
    squashed.push(reduced)
  })
  return squashed
}

const shouldRequest = () => {
  const isOnline = window.navigator.onLine
  const userIsSignedIn = cache.user().apiKey
  if (isOnline && userIsSignedIn) {
    return true
  }
}

const requestOptions = (options) => {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const collaboratorKey = options.space.collaboratorKey
  const apiKey = options.apiKey || cache.user().apiKey
  if (collaboratorKey) {
    headers.append('Space-Authorization', collaboratorKey)
  }
  if (apiKey) {
    headers.append('Authorization', apiKey)
  }
  return {
    method: options.method,
    headers,
    body: JSON.stringify(options.body)
  }
}

const normalizeResponse = async (response) => {
  const success = [200, 201, 202, 204]
  const data = await response.json()
  if (success.includes(response.status)) {
    return data
  } else {
    throw { response, status: response.status }
  }
}

const normalizeSpaceToRemote = (space) => {
  if (!space.removedCards) { return }
  space.removedCards.forEach(card => {
    card.isRemoved = true
    space.cards.push(card)
  })
  return space
}

const self = {
  namespaced: true,
  state: {},
  mutations: {},
  actions: {

    // Queue

    addToQueue: (context, { name, body }) => {
      body = utils.clone(body)
      body.spaceId = context.rootState.currentSpace.id
      const userIsSignedIn = context.rootGetters['currentUser/isSignedIn']
      if (!userIsSignedIn) { return }
      let queue = cache.queue()
      const request = {
        name,
        body
      }
      queue.push(request)
      cache.saveQueue(queue)
      context.dispatch('debouncedProcessQueueOperations')
    },

    requeue: (context, items) => {
      items.forEach(item => {
        let queue = cache.queue()
        queue.push(item)
        cache.saveQueue(queue)
      })
      console.log('🚑 requeue', cache.queue())
    },

    debouncedProcessQueueOperations: debounce(({ dispatch }) => {
      dispatch('processQueueOperations')
    }, 500),

    processQueueOperations: async (context) => {
      const queue = cache.queue()
      const body = squashQueue(queue)
      if (!shouldRequest() || !body.length) { return }
      cache.clearQueue()
      try {
        console.log(`🛫 sending operations`, body)
        const options = requestOptions({ body, method: 'POST', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/operations`, options)
        if (!response.ok) { throw Error(response.statusText) }
      } catch (error) {
        console.error('🚒', error, body)
        // context.commit('addNotification', { message: "Syncing Error. Will retry in 10 seconds…", type: 'danger' }, { root: true })
        context.dispatch('requeue', body)
      }
    },

    // Sign In or Up

    signUp: async (context, { email, password, currentUser }) => {
      const body = currentUser
      body.email = email
      body.password = password
      const options = requestOptions({ body, method: 'POST', space: context.rootState.currentSpace })
      return fetch(`${host}/user/sign-up`, options)
    },
    signIn: async (context, { email, password }) => {
      const body = {
        email: email,
        password: password
      }
      const options = requestOptions({ body, method: 'POST', space: context.rootState.currentSpace })
      return fetch(`${host}/user/sign-in`, options)
    },
    resetPassword: async (context, email) => {
      const body = { email }
      const options = requestOptions({ body, method: 'POST', space: context.rootState.currentSpace })
      return fetch(`${host}/user/reset-password`, options)
    },
    updatePassword: async (context, { password, apiKey }) => {
      const body = { password }
      const options = requestOptions({ body, method: 'PATCH', apiKey, space: context.rootState.currentSpace })
      return fetch(`${host}/user/update-password`, options)
    },

    // User

    getUser: async (context) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/user`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    getUserFavorites: async (context) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/user/favorites`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    getUserSpaces: async (context) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/user/spaces`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    getUserRemovedSpaces: async (context) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/user/removed-spaces`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    removeUserPermanent: async (context) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ method: 'DELETE', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/user/permanent`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    getPublicUser: async (context, user) => {
      try {
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/user/public/${user.id}`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    updateUserFavorites: async (context, body) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ body, method: 'PATCH', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/user/favorites`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },

    // Space

    getNewSpaces: async (context) => {
      try {
        console.log('🛬 getting new spaces')
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await utils.timeout(40000, fetch(`${host}/space/new-spaces`, options))
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },

    getSpace: async (context, space) => {
      try {
        if (!shouldRequest()) { return }
        console.log('🛬 getting remote space', space.id)
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await utils.timeout(40000, fetch(`${host}/space/${space.id}`, options))
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    getSpaceAnonymously: async (context, space) => {
      const isOffline = !window.navigator.onLine
      if (isOffline) { return }
      try {
        console.log('🛬 getting remote space anonymously', space.id)
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await utils.timeout(40000, fetch(`${host}/space/${space.id}`, options))
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    createSpaces: async (context) => {
      try {
        let spaces = cache.getAllSpaces()
        spaces = spaces.map(space => normalizeSpaceToRemote(space))
        let removedSpaces = cache.getAllRemovedSpaces()
        removedSpaces = removedSpaces.map(space => {
          space.isRemoved = true
          space.removedByUserId = cache.user().id
          return space
        })
        removedSpaces.forEach(space => spaces.push(space))
        spaces.map(space => {
          utils.migrationEnsureRemovedCards(space)
          return space
        })
        const body = spaces
        const options = requestOptions({ body, method: 'POST', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/space/multiple`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    getSpaceRemovedCards: async (context, space) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ method: 'GET', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/space/${space.id}/removed-cards`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    addSpaceCollaborator: async (context, { spaceId, collaboratorKey }) => {
      if (!shouldRequest()) { return }
      const userId = context.rootState.currentUser.id
      try {
        const body = { userId, spaceId }
        const space = { collaboratorKey: collaboratorKey }
        const options = requestOptions({ body, method: 'PATCH', space })
        const response = await fetch(`${host}/space/collaborator`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    // removeSpaceCollaborator: async (context, {spaceId, userId}) => {
    //   if (!shouldRequest()) { return }
    //   try {
    //     const body = {spaceId, userId }
    //     const options = requestOptions({ body, method: 'DELETE', space: context.rootState.currentSpace })
    //     const response = await fetch(`${host}/space/collaborator`, options)
    //     return normalizeResponse(response)
    //   } catch (error) {
    //     console.error(error)
    //   }
    // },

    // Card

    updateCards: async (context, body) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ body, method: 'PATCH', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/card/multiple`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },

    // ConnectionType

    updateConnectionTypes: async (context, body) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ body, method: 'PATCH', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/connection-type/multiple`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },

    // Connection

    updateConnections: async (context, body) => {
      if (!shouldRequest()) { return }
      try {
        const options = requestOptions({ body, method: 'PATCH', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/connection/multiple`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
      }
    },

    // Services

    updateArenaAccessToken: async (context, arenaReturnedCode) => {
      try {
        const userIsSignedIn = cache.user().apiKey
        let userId
        if (userIsSignedIn) {
          userId = cache.user().id
        }
        const body = {
          userId,
          arenaReturnedCode: arenaReturnedCode
        }
        const options = requestOptions({ body, method: 'PATCH', space: context.rootState.currentSpace })
        const response = await fetch(`${host}/user/update-arena-access-token`, options)
        return normalizeResponse(response)
      } catch (error) {
        console.error(error)
        context.commit('triggerArenaAuthenticationError', null, { root: true })
        context.commit('isAuthenticatingWithArena', false, { root: true })
      }
    }

  }
}

export default self
