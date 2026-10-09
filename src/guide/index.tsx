import { publicExplanation } from '~app/guide/services/public_content';
import PublicExplanation from '~app/guide/components/PublicExplanation';
import Hero from '~app/guide/components/Hero';
import Mechanism from '~app/guide/components/Mechanism';
import DirectoryNotice from '~app/guide/components/DirectoryNotice';
import JoinSteps from '~app/guide/components/JoinSteps';

export default function Guide({ reviewerCount }: { reviewerCount: number }) {
  return (
    <main>
      <Hero />
      <Mechanism />
      <DirectoryNotice reviewerCount={reviewerCount} />
      <JoinSteps />
      <section className="wrap">
        <PublicExplanation explanation={publicExplanation} />
      </section>
    </main>
  );
}
