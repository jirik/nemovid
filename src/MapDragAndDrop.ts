import type OlMap from 'ol/Map.js';
import type { ObjectEvent } from 'ol/Object';
import type { Types as ObjectEventTypes } from 'ol/ObjectEventType';
import type {
  CombinedOnSignature,
  EventTypes,
  OnSignature,
} from 'ol/Observable';
import {
  type EventsKey,
  type ListenerFunction,
  listen,
  unlistenByKey,
} from 'ol/events.js';
import Event from 'ol/events/Event.js';
import EventType from 'ol/events/EventType.js';
import { TRUE } from 'ol/functions.js';
import Interaction from 'ol/interaction/Interaction.js';
import { assertIsDefined } from './assert.ts';

const DragAndDropEventType = {
  ADD_FILE: 'addfile',
};

export class DragAndDropEvent extends Event {
  file: File;
  constructor(type: string, file: File) {
    super(type);
    this.file = file;
  }
}

export type DragAndDropOnSignature<Return> = OnSignature<
  EventTypes,
  Event,
  Return
> &
  OnSignature<ObjectEventTypes | 'change:active', ObjectEvent, Return> &
  OnSignature<'addfile', DragAndDropEvent, Return> &
  CombinedOnSignature<
    EventTypes | ObjectEventTypes | 'change:active' | 'addfeatures',
    Return
  >;

class DragAndDrop extends Interaction {
  private dropListenKeys_: EventsKey[] | null;
  private target: HTMLElement | null;
  declare on: DragAndDropOnSignature<EventsKey>;

  constructor(options?: { target?: HTMLElement | null }) {
    const opts = options || {};

    super({
      handleEvent: TRUE,
    });

    this.dropListenKeys_ = null;

    this.target = opts.target ? opts.target : null;
  }

  registerListeners_() {
    const map = this.getMap();
    if (map) {
      const dropArea = this.target ? this.target : map.getViewport();
      this.dropListenKeys_ = [
        listen(
          dropArea,
          EventType.DROP,
          this.handleDrop as ListenerFunction,
          this,
        ),
        listen(
          dropArea,
          EventType.DRAGENTER,
          this.handleStop as ListenerFunction,
          this,
        ),
        listen(
          dropArea,
          EventType.DRAGOVER,
          this.handleStop as ListenerFunction,
          this,
        ),
        listen(
          dropArea,
          EventType.DROP,
          this.handleStop as ListenerFunction,
          this,
        ),
      ];
    }
  }

  setActive(active: boolean) {
    if (!this.getActive() && active) {
      this.registerListeners_();
    }
    if (this.getActive() && !active) {
      this.unregisterListeners_();
    }
    super.setActive(active);
  }

  setMap(map: OlMap) {
    this.unregisterListeners_();
    super.setMap(map);
    if (this.getActive()) {
      this.registerListeners_();
    }
  }

  unregisterListeners_() {
    if (this.dropListenKeys_) {
      this.dropListenKeys_.forEach(unlistenByKey);
      this.dropListenKeys_ = null;
    }
  }

  handleDrop(event: DragEvent) {
    const files = event.dataTransfer?.files || [];
    if (files.length > 0) {
      this.dispatchEvent(
        new DragAndDropEvent(DragAndDropEventType.ADD_FILE, files[0]),
      );
    }
  }

  handleStop(event: DragEvent) {
    event.stopPropagation();
    event.preventDefault();
    assertIsDefined(event.dataTransfer);
    event.dataTransfer.dropEffect = 'copy';
  }
}

export default DragAndDrop;
