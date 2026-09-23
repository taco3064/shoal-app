import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({
  name: 'shoal-app',
  modules: [
    { name: 'app', does: 'Compose Astro routes, layouts, and page metadata.', dependsOn: ['guide'] },
    { name: 'guide', does: 'Explain Shoal endorsements and guide reviewers through joining the network.' },
  ],
  emit: { agents: ['agents'] },
});
