/** What an EIP-1193 `request` takes. */
export interface RequestArguments {
    readonly method: string;
    readonly params?: readonly unknown[] | object;
}
