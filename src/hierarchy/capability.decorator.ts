import { SetMetadata } from '@nestjs/common';
import { Capability } from './permissions';
export const CAP_KEY = 'capability';
export const RequireCap = (cap: Capability) => SetMetadata(CAP_KEY, cap);
