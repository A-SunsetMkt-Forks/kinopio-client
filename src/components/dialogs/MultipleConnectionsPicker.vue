<script setup>
import { reactive, computed, onMounted, onUnmounted, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useConnectionStore } from '@/stores/useConnectionStore'

import utils from '@/utils.js'

import last from 'lodash-es/last'
import randomColor from 'randomcolor'

const globalStore = useGlobalStore()
const connectionStore = useConnectionStore()

const dialogElement = ref(null)

const props = defineProps({
  visible: Boolean,
  selectedConnections: Array,
  selectedConnectionTypes: Array
})

const state = reactive({
  nextConnectionTypeColor: ''
})

// dialog

watch(() => props.visible, async (value, prevValue) => {
  await nextTick()
  if (value) {
    scrollIntoView()
    updateNextConnectionColor()
  }
})
const scrollIntoView = () => {
  const element = dialogElement.value
  globalStore.scrollElementIntoView({ element })
}

// types

const connectionTypesByUpdatedAt = computed(() => {
  return connectionStore.getConnectionTypesByUpdatedAt()
})
const connectionTypes = computed(() => connectionStore.getAllConnectionTypes)
const changeConnectionTypes = (type) => {
  props.selectedConnections.forEach(connection => {
    const update = {
      id: connection.id,
      connectionTypeId: type.id
    }
    connectionStore.updateConnection(update)
  })
  connectionStore.updatePrevConnectionTypeId(type.id)
}
const connectionTypeIsActive = (type) => {
  return props.selectedConnections.find(connection => {
    return connection.connectionTypeId === type.id
  })
}
const addConnectionType = () => {
  connectionStore.createConnectionType({ color: state.nextConnectionTypeColor })
  const types = utils.clone(connectionTypes.value)
  const newType = last(types)
  changeConnectionTypes(newType)
  updateNextConnectionColor()
}
const updateNextConnectionColor = () => {
  state.nextConnectionTypeColor = randomColor({ luminosity: 'light' })
}
</script>

<template lang="pug">
dialog.narrow.multiple-connections-picker(v-if="visible" :open="visible" ref="dialogElement" @click.left.stop)
  section.results-actions
    button(@click.left="addConnectionType")
      img.icon(src="@/assets/add.svg")
      .badge.badge-in-button(:style="{backgroundColor: state.nextConnectionTypeColor}")
      span Type
  section.results-section
    ul.results-list
      template(v-for="type in connectionTypesByUpdatedAt" :key="type.id")
        li(:class="{ active: connectionTypeIsActive(type) }" @click.left="changeConnectionTypes(type)" tabindex="0" v-on:keyup.enter="changeConnectionTypes(type)")
          .badge(:style="{backgroundColor: type.color}")
          .name {{type.name}}
</template>

<style lang="stylus">
.multiple-connections-picker
  .badge-in-button
    margin-left 5px
</style>
