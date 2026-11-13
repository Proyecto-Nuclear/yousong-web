import type { Song } from "./admin-api";
import type { DemoApi } from "./demo-api";
import {
  type DefaultList,
  type ListSummary,
  ROTATION,
  type Rotation,
} from "./demo-contracts";
import { OperationGate } from "./demo-operation";

interface DraftState {
  songs: Song[];
  name: string;
  rotation: Rotation;
  current: DefaultList | null;
  history: ListSummary[];
  loaded: boolean;
  busy: boolean;
  uncertain: boolean;
  notice: string;
  error: string;
}
type ListApi = Pick<DemoApi, "currentList" | "listHistory" | "publishList">;

// One owner for catalog picks and list editing, retained across owner tabs.
export class ListDraft {
  private state: DraftState = {
    songs: [],
    name: "General",
    rotation: ROTATION.SEQUENTIAL,
    current: null,
    history: [],
    loaded: false,
    busy: false,
    uncertain: false,
    notice: "",
    error: "",
  };
  private gate = new OperationGate();
  private listeners = new Set<() => void>();
  private edited = false;
  private initialized = false;
  private disposed = false;
  constructor(
    private api: ListApi,
    private id: string,
    private canManage: boolean,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<DraftState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  enter() {
    this.disposed = false;
    if (!this.state.loaded) void this.refresh();
  }
  dispose() {
    this.disposed = true;
    this.gate.invalidate();
  }
  edit(patch: Partial<Pick<DraftState, "name" | "rotation">>) {
    if (this.state.busy && this.state.uncertain) return;
    this.edited = true;
    this.update(patch);
  }
  pick(song: Song) {
    if (
      !this.canManage ||
      (this.state.busy && this.state.uncertain) ||
      this.state.songs.length >= 200 ||
      this.state.songs.some((item) => item.videoId === song.videoId)
    )
      return;
    this.edited = true;
    this.update({ songs: [...this.state.songs, song] });
  }
  remove(videoId: string) {
    if (this.state.busy) return;
    this.edited = true;
    this.update({
      songs: this.state.songs.filter((song) => song.videoId !== videoId),
    });
  }
  private async read(ticket: number) {
    const current = await this.api.currentList(this.id);
    if (!this.gate.valid(ticket) || this.disposed) return;
    const history = this.canManage ? await this.api.listHistory(this.id) : [];
    if (!this.gate.valid(ticket) || this.disposed) return;
    const patch: Partial<DraftState> = {
      current,
      history,
      loaded: true,
      uncertain: false,
    };
    if (!this.initialized && !this.edited && current) {
      patch.name = current.nombre;
      patch.rotation = current.politicaRotacion;
      patch.songs = current.canciones.map((song) => ({
        videoId: song.youtubeVideoId,
        titulo: song.titulo ?? song.youtubeVideoId,
        artista: song.artista ?? "Artista sin información",
        canal: song.canal ?? "",
        artistaVerificado: song.artistaVerificado,
        duracionSegundos: song.duracionSegundos,
        miniaturaUrl: song.miniaturaUrl,
      }));
    }
    this.initialized = true;
    this.update(patch);
  }
  private async run(task: (ticket: number) => Promise<void>) {
    if (this.disposed) return;
    const ticket = this.gate.begin();
    if (ticket === null) return;
    this.update({ busy: true, error: "" });
    try {
      await task(ticket);
    } catch {
      if (this.gate.valid(ticket) && !this.disposed)
        this.update({
          error: this.state.uncertain
            ? "No pudimos confirmar el guardado. Revisa la lista antes de volver a guardar."
            : "No pudimos cargar la lista. Intenta de nuevo.",
        });
    } finally {
      if (this.gate.valid(ticket) && !this.disposed)
        this.update({ busy: false });
      this.gate.end(ticket);
    }
  }
  refresh = () => this.run((ticket) => this.read(ticket));
  publish = async () => {
    if (!this.canManage || this.state.uncertain || !this.state.songs.length)
      return;
    await this.run(async (ticket) => {
      this.update({ uncertain: true, notice: "" });
      const published = await this.api.publishList(this.id, {
        nombre: this.state.name,
        politicaRotacion: this.state.rotation,
        canciones: this.state.songs.map((song) => song.videoId),
      });
      if (!this.gate.valid(ticket) || this.disposed) return;
      this.update({
        current: published,
        loaded: true,
        uncertain: false,
        notice: "Lista guardada",
      });
      await this.read(ticket);
    });
  };
}
