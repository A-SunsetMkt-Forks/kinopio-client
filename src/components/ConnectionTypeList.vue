<script setup>
import { reactive, computed, onMounted, onUnmounted, watch, ref, nextTick } from 'vue'

import ResultsFilter from '@/components/ResultsFilter.vue'
// import ColorPicker from '@/components/dialogs/ColorPicker.vue'

// onMounted(() => {
//   store.subscribe((mutation, state) => {
//     if (name === 'triggerCloseChildDialogs') {
//       hideColorPicker()
//     }
//   })
// })

const emit = defineEmits(['select', 'updateTypeColor'])

const props = defineProps({
  resultsFilterIsVisible: Boolean,
  connectionTypes: Array,
  connections: Array,
  canEditConnection: Boolean
})
const state = reactive({
  filter: '',
  filteredConnectionTypes: []
  // colorPickerIsVisible: false
})

// results filter

const updateFilter = (filter) => {
  state.filter = filter
}
const updateFilteredConnectionTypes = (types) => {
  state.filteredConnectionTypes = types
}
const connectionTypesFiltered = computed(() => {
  if (state.filter) {
    return state.filteredConnectionTypes
  } else {
    return props.connectionTypes
  }
})

// list items

const connectionTypeIsActive = (type) => {
  return Boolean(props.connections.find(connection => connection.connectionTypeId === type.id))
}
const emitSelect = (type) => {
  emit('select', type)
}

// type color

// const hideColorPicker = () => {
//   state.colorPickerIsVisible = false
// }
// const toggleColorPicker = () => {
//   state.colorPickerIsVisible = !state.colorPickerIsVisible
// }
// const updateTypeColorEmit = (color) => {
//   emit('updateTypeColor', color)
// }
</script>

<template lang="pug">
ResultsFilter(v-if="resultsFilterIsVisible" :items="connectionTypes" @updateFilter="updateFilter" @updateFilteredItems="updateFilteredConnectionTypes")
ul.results-list.connection-type-list
  template(v-for="type in connectionTypesFiltered" :key="type.id")
    li(:class="{ active: connectionTypeIsActive(type), disabled: !canEditConnection }" @click.left="emitSelect(type)" :data-type-id="type.id")
      .badge(:style="{backgroundColor: type.color}")
      //- .button-wrap.change-color-wrap
      //-   button.change-color.small-button(:disabled="!canEditConnection" @click.left.stop="toggleColorPicker" :class="{active: state.colorPickerIsVisible}")
      //-     .current-color(:style="{backgroundColor: type.color}")
      //-   ColorPicker(:currentColor="type.color" :visible="state.colorPickerIsVisible" @selectedColor="updateTypeColorEmit")
      .name {{type.name}}
</template>

<style lang="stylus">
ul.connection-type-list
  .change-color-wrap
    height 20px
  .change-color
    height initial
    margin-right 5px
    > .current-color
      margin 2px 0
</style>
