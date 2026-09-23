import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({
  name: 'shoal-app',
  modules: [{ name: 'app', does: 'Compose the public Shoal website and its interactive UI.' }],
  emit: { agents: ['agents'] },
});
