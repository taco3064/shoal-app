import reviewProtocolJson from '~protocol/review-v1.json' with { type: 'json' };
import type { ReviewProtocolContract } from './types';

export const reviewProtocol = reviewProtocolJson as ReviewProtocolContract;
