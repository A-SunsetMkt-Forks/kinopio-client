// broadcast ←→ [websocket] ←→ server

// handles websockets, and delegates events to broadcast

import nanoid from 'nanoid'

import utils from '@/utils.js'

let websocket
let currentSpaceRoom
const clientId = nanoid()

// TODO QA offline -> online, server down -> up (reconnect w one instance back to existing clients)

export default function createWebSocketPlugin () {
  return store => {
    store.subscribe((mutation, state) => {
      // connect
      if (mutation.type === 'broadcast/connect') {
        const host = utils.websocketHost()
        websocket = new WebSocket(host)
        websocket.onopen = (event) => {
          console.log('🌝', event.target)
          store.commit('broadcast/joinSpaceRoom')
        }
        websocket.onmessage = ({ data }) => {
          data = JSON.parse(data)
          if (data.clientId === clientId) { return }
          console.log('🌛', data) // temp
          // store.dispatch('broadcast/canEditSpace', data.canEditSpace)
        }
        websocket.onclose = (event) => {
          console.error('🌚', event)
          store.dispatch('broadcast/reconnect')
        }
        websocket.onerror = (event) => {
          console.error('🚒', event)
        }
      }

      // join space room
      if (mutation.type === 'broadcast/joinSpaceRoom') {
        const space = utils.clone(store.state.currentSpace)
        const currentSpaceHasUrl = utils.currentSpaceHasUrl(space)
        console.log(currentSpaceHasUrl, space)
        if (!currentSpaceHasUrl) { return }
        if (currentSpaceRoom === space.id) { return }
        console.log('🌜 join space room', space.name)
        currentSpaceRoom = space.id
        websocket.send(JSON.stringify({
          message: 'joinSpaceRoom',
          spaceId: store.state.currentSpace.id,
          userId: store.state.currentUser.id,
          clientId
        }))
      }
    })
  }
}
