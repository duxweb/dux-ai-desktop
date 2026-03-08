import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { initSystemTheme } from './lib/theme'
import './styles.css'

initSystemTheme()

const app = createApp(App)

app.use(createPinia())
app.mount('#app')
