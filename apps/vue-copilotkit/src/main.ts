import '@copilotkit/vue/styles.css';
import './styles.css';
import { createApp } from 'vue';
import App from './app/App.vue';
import { registerPageTools } from '@soverius-ai/example-shared';

void registerPageTools();
createApp(App).mount('#root');
