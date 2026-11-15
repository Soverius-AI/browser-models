import { mount } from '@vue/test-utils';
import App from './App.vue';

describe('App', () => {
  it('shows the model picker with every example model', () => {
    const wrapper = mount(App);

    expect(wrapper.find('h1').text()).toBe('browser-models');
    expect(wrapper.text()).toContain('Demo · scripted, no model');
  });
});
