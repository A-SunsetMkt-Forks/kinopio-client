<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, onUnmounted, watch, ref, nextTick } from 'vue'
import { useStore } from 'vuex'
const store = useStore()

const emit = defineEmits(['updateLocalSpaces'])

const props = defineProps({
  parentIsDialog: Boolean
})

const isTranslucentButton = computed(() => {
  if (props.parentIsDialog) { return }
  return !store.state.currentUser.shouldIncreaseUIContrast
})
const isOnline = computed(() => store.state.isOnline)

const isFavoriteSpace = computed(() => store.getters['currentSpace/isFavorite']())
const toggleIsFavoriteSpace = () => {
  const space = store.state.currentSpace
  const value = !isFavoriteSpace.value
  store.dispatch('currentUser/updateFavoriteSpace', { space, value })
  emit('updateLocalSpaces')
}
</script>

<template lang="pug">
  button.favorite-space-button(v-if="isOnline" :class="{active: isFavoriteSpace && props.parentIsDialog, 'translucent-button': isTranslucentButton}" @click.left.prevent="toggleIsFavoriteSpace" title="Favorite Space")
    img.icon(v-show="isFavoriteSpace" src="@/assets/heart.svg")
    img.icon(v-show="!isFavoriteSpace" src="@/assets/heart-empty.svg")
</template>

<style lang="stylus">
.favorite-space-button
  .icon
    margin 0 !important
</style>
