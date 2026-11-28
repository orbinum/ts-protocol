/**
 * An error a provider rejects a request with (EIP-1193 `ProviderRpcError`). Dapps
 * switch on `code`; `message` is for logs.
 */

/** The error as it crosses a message channel: a class does not survive `postMessage`. */
export interface ProviderRpcErrorShape {
    code: number;
    message: string;
    data?: unknown;
}

export class ProviderRpcError extends Error implements ProviderRpcErrorShape {
    override readonly name = 'ProviderRpcError';

    constructor(
        readonly code: number,
        message: string,
        readonly data?: unknown
    ) {
        super(message);
    }

    /** The plain shape, to send across a channel. */
    toShape(): ProviderRpcErrorShape {
        return this.data === undefined
            ? { code: this.code, message: this.message }
            : { code: this.code, message: this.message, data: this.data };
    }
}
