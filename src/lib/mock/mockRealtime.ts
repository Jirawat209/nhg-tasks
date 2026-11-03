// No-op realtime: there is only ever one local client, so there is nothing to
// broadcast changes to. Chainable enough that the real subscribe/unsubscribe
// call sites don't need to know the difference.

function makeChannel(_name: string) {
    const channel: any = {
        on() { return channel; },
        subscribe(cb?: (status: string) => void) {
            if (cb) setTimeout(() => cb('SUBSCRIBED'), 0);
            return channel;
        },
        unsubscribe() { return Promise.resolve('ok'); }
    };
    return channel;
}

export const mockRealtime = {
    channel: (name: string) => makeChannel(name),
    removeChannel: (_channel: any) => undefined
};
