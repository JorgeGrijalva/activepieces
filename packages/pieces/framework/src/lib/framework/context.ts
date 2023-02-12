

export interface TriggerHookContext<T> {
    webhookUrl: string,
    propsValue: T,
    store: Store
}

export interface TriggerContext<T> {
    payload: Record<string, never> | {
        body: any,
        headers: Record<string, string>,
        queryParams: Record<string, string>,
    };
    propsValue: T,
    store: Store
}

export interface ActionContext<T> {
    propsValue: T,
    store: Store
}

export interface Store {
    put<T>(key: string, value: T, scope: StoreScope): Promise<T>;
    get<T>(key: string, scope: StoreScope): Promise<T | null>;
}

export enum StoreScope {
    COLLECTION = "COLLECTION",
    FLOW = "FLOW"
}