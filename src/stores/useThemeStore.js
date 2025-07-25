import { defineStore } from 'pinia'
import { useUserStore } from '@/stores/useUserStore'
import { useSpaceStore } from '@/stores/useSpaceStore'

import { useGlobalStore } from '@/stores/useGlobalStore'

import utils from '@/utils.js'

const themes = {
  light: {
    name: 'light',
    colors: {
      'color-scheme': 'light',
      primary: 'black',
      'primary-border': 'rgba(0,0,0,0.3)',
      'primary-background': 'white',
      'text-link': '#143997',
      'primary-transparent': 'rgba(0,0,0,0.5)',
      'button-background': 'rgba(255,255,255,1)',
      'button-background-translucent': 'rgba(255,255,255,0.5)',
      'secondary-background': '#e3e3e3',
      'secondary-hover-background': '#d8d8d8',
      'secondary-active-background': '#cdcdcd',
      'tertiary-hover-background': '#c1c1c1',
      'danger-background': '#ffb8b3',
      'danger-hover-background': '#ffa49e',
      'danger-active-background': '#ff928b',
      'info-background': '#90ffff',
      'success-background': '#67ffbb',
      'search-background': 'yellow',
      'new-unread-background': '#57a8ff',
      'secondary-active-background-dark': '#cdcdcd',
      'light-shadow': 'rgba(0,0,0,0.20)',
      'heavy-shadow': 'rgba(0,0,0,0.25)',
      'inset-heavy-shadow': 'rgba(0,0,0,0.35)',
      // codeblock
      'code-comment': '#898989',
      'code-punctuation': 'black',
      'code-string': '#a2162d',
      'code-keyword': '#00119e',
      // user badges
      'badge-donor': '#ff9dff',
      'badge-upgraded': 'springgreen'
    }
  },
  dark: {
    name: 'dark',
    colors: {
      'color-scheme': 'dark',
      primary: 'white',
      'primary-border': 'rgba(255,255,255,0.3)',
      'primary-background': 'black',
      'text-link': '#788cc9',
      'primary-transparent': 'rgba(0,0,0,0.5)',
      'button-background': 'rgba(0,0,0,1)',
      'button-background-translucent': 'rgba(0,0,0,0.3)',
      'secondary-background': '#262626',
      'secondary-hover-background': '#555',
      'secondary-active-background': '#333',
      'tertiary-hover-background': '444',
      'danger-background': '#732b26',
      'danger-hover-background': '#8f3832',
      'danger-active-background': '#a83730',
      'info-background': '#085353',
      'success-background': '#183f24',
      'search-background': '#6f6d01',
      'new-unread-background': '#2f6fb5',
      'secondary-active-background-dark': '#444',
      'light-shadow': 'rgba(0,0,0,0.25)',
      'heavy-shadow': 'rgba(0,0,0,0.55)',
      'inset-heavy-shadow': 'rgba(0,0,0,0.65)',
      // codeblock
      'code-comment': '#898989',
      'code-punctuation': 'white',
      'code-string': '#fddd88',
      'code-keyword': '#79e6d9',
      // user badges
      'badge-donor': 'blueviolet',
      'badge-upgraded': 'green',
      'badge-moderator': 'olive',
      'badge-ambassador': '#0f9189'
    }
  }
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    systemTheme: 'light'
  }),
  getters: {
    getIsThemeDark () {
      const userStore = useUserStore()
      if (userStore.themeIsSystem) {
        return this.systemTheme === 'dark'
      } else {
        return userStore.theme === 'dark'
      }
    },
    getThemeName () {
      const isThemeDark = this.getIsThemeDark
      let themeName
      if (isThemeDark) {
        return 'dark'
      } else {
        return 'light'
      }
    },
    getThemeColors () {
      const themeName = this.getThemeName
      return themes[themeName].colors
    }

  },

  actions: {
    updateSystemTheme () {
      const isDarkModeOS = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (isDarkModeOS) {
        this.systemTheme = 'dark'
      } else {
        this.systemTheme = 'light'
      }
      this.restoreTheme()
    },

    // theme is system

    updateThemeIsSystem (value) {
      const globalStore = useGlobalStore()
      const userStore = useUserStore()
      userStore.updateUser({ themeIsSystem: value })
      globalStore.triggerUpdateTheme()
    },
    toggleThemeIsSystem () {
      const userStore = useUserStore()
      const value = !userStore.themeIsSystem
      this.updateThemeIsSystem(value)
      if (value) {
        const themeName = this.systemTheme
        this.updateTheme(themeName)
      }
    },

    // update

    toggleTheme () {
      const userStore = useUserStore()
      const prevTheme = userStore.theme || 'light'
      let theme
      if (prevTheme === 'light') {
        theme = 'dark'
      } else {
        theme = 'light'
      }
      this.updateTheme(theme)
    },
    updateTheme (themeName) {
      const globalStore = useGlobalStore()
      const userStore = useUserStore()
      const normalizedThemeName = themeName || 'light'
      // colors
      const theme = themes[normalizedThemeName]
      const colors = theme.colors
      const keys = Object.keys(colors)
      keys.forEach(key => {
        utils.setCssVariable(key, colors[key])
      })
      userStore.updateUser({ theme: normalizedThemeName })
      globalStore.triggerUpdateTheme()
    },
    restoreTheme () {
      const userStore = useUserStore()
      let themeName = userStore.theme
      const themeIsSystem = userStore.themeIsSystem
      if (themeIsSystem) {
        themeName = this.systemTheme || themeName
      }
      this.updateTheme(themeName)
    },

    // preview image

    previewImageThemeOptions () {
      const spaceStore = useSpaceStore()
      const isDarkTheme = this.getIsThemeDark
      let background = spaceStore.background
      let backgroundTint = spaceStore.backgroundTint
      const backgroundElement = document.querySelector('#space-background-image')
      const backgroundTintElement = document.querySelector('#space-background-tint')
      if (background && backgroundElement) {
        let domBackground = backgroundElement.style.backgroundImage
        domBackground = utils.urlFromCSSBackgroundImage(domBackground)
        background = domBackground || background
      }
      if (isDarkTheme && backgroundTintElement) {
        const domBackgroundTint = backgroundTintElement.style.backgroundColor
        backgroundTint = domBackgroundTint || backgroundTint
      }
      const theme = {
        secondaryBackground: this.getThemeColors['secondary-background'],
        primaryBorder: this.getThemeColors['primary-border'],
        primaryBackground: this.getThemeColors['primary-background'],
        entityRadius: 6,
        backgroundTint,
        background
      }
      return { isDarkTheme, theme }
    }
  }
})
