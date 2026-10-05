import HostedSettings from '~app/join/components/HostedSettings';
import QuickJoin from '~app/join/components/QuickJoin';
import useQuickJoin from '~app/join/hooks/useQuickJoin';

export default function Join({ serviceUrl }: { serviceUrl: string }) {
  const join = useQuickJoin(serviceUrl);

  return (
    <>
      <QuickJoin join={join} />
      <HostedSettings serviceUrl={serviceUrl} session={join.session} />
    </>
  );
}
