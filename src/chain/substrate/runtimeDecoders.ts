/**
 * SCALE decoders built from a runtime's metadata, cached per runtime.
 *
 * A block must be decoded with the metadata of the runtime it executed under:
 * a call or event whose shape changed in an upgrade misdecodes, or fails,
 * under any other. Metadata is fetched once per `spec_version`, over plain RPC
 * rather than PAPI's chainHead, which only serves pinned (recent) blocks.
 */
import { getDynamicBuilder, getLookupFn } from '@polkadot-api/metadata-builders';
import { decAnyMetadata, unifyMetadata } from '@polkadot-api/substrate-bindings';
import { getExtrinsicDecoder } from '@polkadot-api/tx-utils';
import { fromHex } from '../../foundation/encoding/hex';
import type { RawRuntimeVersion } from './types/raw';

export type DynamicBuilder = ReturnType<typeof getDynamicBuilder>;
export type ExtrinsicDecoder = ReturnType<typeof getExtrinsicDecoder>;

/** Block hashes whose `spec_version` is remembered before the map is reset. */
const SPEC_CACHE_LIMIT = 4096;

/** One runtime's decoders, each built on first use: most callers need only one. */
class Runtime {
    private _builder: DynamicBuilder | null = null;
    private _extrinsic: ExtrinsicDecoder | null = null;

    constructor(private readonly metadata: Uint8Array) {}

    get builder(): DynamicBuilder {
        this._builder ??= getDynamicBuilder(
            getLookupFn(unifyMetadata(decAnyMetadata(this.metadata)))
        );
        return this._builder;
    }

    get extrinsic(): ExtrinsicDecoder {
        this._extrinsic ??= getExtrinsicDecoder(this.metadata);
        return this._extrinsic;
    }
}

type Rpc = <T>(method: string, params: unknown[]) => Promise<T>;

export class RuntimeDecoders {
    private _connected: Promise<Runtime> | null = null;
    /** Runtimes by `spec_version`. */
    private readonly _bySpec = new Map<number, Promise<Runtime>>();
    /** `spec_version` per block hash. A hash never changes runtime. */
    private readonly _specOfBlock = new Map<string, number>();

    constructor(
        private readonly rpc: Rpc,
        /** Metadata of the runtime the client connected under. */
        private readonly connectedMetadata: () => Promise<Uint8Array>
    ) {}

    /** The SCALE builder for the runtime at `blockHash`, or the connected one. */
    async builder(blockHash?: string): Promise<DynamicBuilder> {
        return (await this.runtime(blockHash)).builder;
    }

    /** The extrinsic decoder for the runtime at `blockHash`, or the connected one. */
    async extrinsic(blockHash?: string): Promise<ExtrinsicDecoder> {
        return (await this.runtime(blockHash)).extrinsic;
    }

    private runtime(blockHash?: string): Promise<Runtime> {
        if (!blockHash) {
            this._connected ??= retryable(
                this.connectedMetadata().then((m) => new Runtime(m)),
                () => {
                    this._connected = null;
                }
            );
            return this._connected;
        }
        return this.runtimeAt(blockHash);
    }

    private async runtimeAt(blockHash: string): Promise<Runtime> {
        const spec = await this.specOf(blockHash);
        let runtime = this._bySpec.get(spec);
        if (!runtime) {
            runtime = retryable(
                this.rpc<string>('state_getMetadata', [blockHash]).then(
                    (hex) => new Runtime(fromHex(hex as `0x${string}`))
                ),
                () => this._bySpec.delete(spec)
            );
            this._bySpec.set(spec, runtime);
        }
        return runtime;
    }

    private async specOf(blockHash: string): Promise<number> {
        const known = this._specOfBlock.get(blockHash);
        if (known !== undefined) return known;
        const { specVersion } = await this.rpc<RawRuntimeVersion>('state_getRuntimeVersion', [
            blockHash,
        ]);
        // Reset at the cap; an LRU only if a hot set ever matters.
        if (this._specOfBlock.size >= SPEC_CACHE_LIMIT) this._specOfBlock.clear();
        this._specOfBlock.set(blockHash, specVersion);
        return specVersion;
    }
}

/** `p`, with `forget` run if it rejects, so a failed fetch is retried rather than cached. */
function retryable<T>(p: Promise<T>, forget: () => void): Promise<T> {
    p.catch(forget);
    return p;
}
