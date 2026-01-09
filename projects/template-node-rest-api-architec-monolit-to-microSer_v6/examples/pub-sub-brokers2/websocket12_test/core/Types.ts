export interface Packet {
    event: string
    args: any[]
    metadata: {
        from: string
        nsp: string
        room?: string
        timestamp: number
    }
}

export interface BroadcastOptions {
    rooms?: Set<string>
    except?: Set<string>
}

export interface ServerConfig {
    nodeId: string
    adapter?: any
    pathPrefix?: string
}

export abstract class Adapter {
    constructor(protected nsp: any) {}
    abstract broadcast(packet: any, opts: BroadcastOptions): void
    abstract addAll(id: string, rooms: string[]): void
    abstract delAll(id: string, rooms: string[]): void
}
