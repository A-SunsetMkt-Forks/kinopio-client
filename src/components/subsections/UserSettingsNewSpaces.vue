<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'
import { useStore } from 'vuex'

const store = useStore()

// date cards

const dateImageUrl = computed(() => store.state.dateImageUrl)
const shouldHideDateCards = computed(() => { return store.state.currentUser.shouldHideDateCards })
const toggleShouldHideDateCards = () => {
  const value = !shouldHideDateCards.value
  store.dispatch('currentUser/shouldHideDateCards', value)
}

// tutorial cards

const shouldHideTutorialCards = computed(() => { return store.state.currentUser.shouldHideTutorialCards })
const toggleShouldHideTutorialCards = () => {
  const value = !shouldHideTutorialCards.value
  store.dispatch('currentUser/shouldHideTutorialCards', value)
}
</script>

<template lang="pug">
span.user-settings-new-spaces
  .row
    label(:class="{active: shouldHideDateCards}" @click.left.prevent="toggleShouldHideDateCards" @keydown.stop.enter="toggleShouldHideDateCards")
      input(type="checkbox" v-model="shouldHideDateCards")
      img.date-image(:src="dateImageUrl")
      span Hide Date Card
  .row
    label(:class="{active: shouldHideTutorialCards}" @click.left.prevent="toggleShouldHideTutorialCards" @keydown.stop.enter="toggleShouldHideTutorialCards")
      input(type="checkbox" v-model="shouldHideTutorialCards")
      span Hide Tutorial Cards
</template>

<style lang="stylus">
.user-settings-new-spaces
  .date-image
    display inline
    width 17px
    vertical-align -3px
    border-radius var(--small-entity-radius)
    margin-right 4px
</style>
