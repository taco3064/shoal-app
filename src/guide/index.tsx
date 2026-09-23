import Hero from '~app/guide/components/Hero';
import Mechanism from '~app/guide/components/Mechanism';
import DirectoryNotice from '~app/guide/components/DirectoryNotice';
import JoinSteps from '~app/guide/components/JoinSteps';

export default function Guide() {
  return (
    <main>
      <Hero />
      <Mechanism />
      <DirectoryNotice />
      <JoinSteps />
    </main>
  );
}
