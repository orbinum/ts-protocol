import type { OrbinumSignMessageParams } from '../orbinum/orbinum-sign-message-params';
import { isRecord } from './is-record';
import { isUtf8Within } from './is-utf8-within';
import { MAX_SIGN_MESSAGE_BYTES } from './limits';

export function isOrbinumSignMessageParams(value: unknown): value is OrbinumSignMessageParams {
    return isRecord(value) && isUtf8Within(value['message'], MAX_SIGN_MESSAGE_BYTES);
}
