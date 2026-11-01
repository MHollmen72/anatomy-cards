type State = {
    c: number;
    s0: number;
    s1: number;
    s2: number;
};
declare function alea(seed?: number | string): {
    (): number;
    int32: () => number;
    double: () => number;
    state: () => State;
    importState: (state: State) => /*elided*/ any;
};
export { alea };
