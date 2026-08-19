import {adaptPublicState} from "../adapters/state.adapter";
import type {PublicStateResponseDto} from "../dto/state.dto";
import {fetchFullStateCompat, fetchInitialStateCompat} from "../state-compat";

export const stateApi = {
  async initial(signal?: AbortSignal) {
    const response = await fetchInitialStateCompat<PublicStateResponseDto>(signal);
    return adaptPublicState(response);
  },
  async full(signal?: AbortSignal) {
    const response = await fetchFullStateCompat<PublicStateResponseDto>(signal);
    return adaptPublicState(response);
  },
};
