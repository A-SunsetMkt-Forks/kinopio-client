<script setup>
import { reactive, computed, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'

import { useGlobalStore } from '@/stores/useGlobalStore'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'

const globalStore = useGlobalStore()
const userStore = useUserStore()
const spaceStore = useSpaceStore()

const props = defineProps({
  message: String
})

const currentUserIsSignedIn = computed(() => userStore.getUserIsSignedIn)
const currentUserIsUpgraded = computed(() => userStore.isUpgraded)
const visible = computed(() => {
  return !currentUserIsSignedIn.value || !currentUserIsUpgraded.value
})

const triggerSignUpOrInIsVisible = () => {
  globalStore.closeAllDialogs()
  globalStore.triggerSignUpOrInIsVisible()
}
const triggerUpgradeUserIsVisible = () => {
  globalStore.closeAllDialogs()
  globalStore.triggerUpgradeUserIsVisible()
}

</script>

<template lang="pug">
section.upgraded-user-required(v-if="visible")
  //- sign up or in
  template(v-if="!currentUserIsSignedIn")
    p
      span.badge.info Sign Up or In
      span {{props.message}}
    button(@click.left="triggerSignUpOrInIsVisible") Sign Up or In
  //- upgrade
  template(v-else-if="!currentUserIsUpgraded")
    p
      span.badge.info Upgrade
      span {{props.message}}
    button(@click.left="triggerUpgradeUserIsVisible") Upgrade for Groups

</template>

<style lang="stylus">
// .upgraded-user-required
</style>
