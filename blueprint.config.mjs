import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({
  name: 'shoal-app',
  modules: [
    { name: 'action', does: 'Compute and package the Reviewer Summary Marketplace Action source.', dependsOn: ['protocol'] },
    { name: 'app', does: 'Compose Astro routes, layouts, and page metadata.', dependsOn: ['guide'] },
    { name: 'guide', does: 'Render the public Reviewer Directory and explain Shoal endorsements and onboarding.', dependsOn: ['network', 'join'] },
    { name: 'join', does: 'Authenticate Reviewers and converge explicitly confirmed station setup and Policy changes.', dependsOn: ['protocol'] },
    { name: 'network', does: 'Discover eligible Reviewer Nodes, verify Summary provenance, and compile the flat Network Projection.', dependsOn: ['protocol'] },
    { name: 'protocol', does: 'Own Shoal protocol parsing, validation, schemas, and versioned contracts.' },
  ],
  emit: { agents: ['agents'] },
});
