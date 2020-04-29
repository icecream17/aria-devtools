import Store from "./index";
import traverse from "../AOM/traverse";
import { getNodeKey } from "../AOM/utils";
import { AOMElement, NodeElement } from "../AOM/types";
import { action, runInAction } from "mobx";
import { IdleScheduler } from "./utils";

export default class Observer {
  store: Store = new Store();
  observer: MutationObserver;
  root: AOMElement;
  scheduler: IdleScheduler;

  constructor(root: HTMLElement) {
    this.root = traverse(root);

    this.store.register(this.root);
    this.observer = new MutationObserver(this.onMutation);
    this.observer.observe(root, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });

    document.body.addEventListener("blur", this.onBlur, true);
    document.body.addEventListener("focus", this.onFocus, true);
    document.body.addEventListener("input", this.onInput, true);
    document.body.addEventListener("transitionend", this.onInput, true);

    this.scheduler = new IdleScheduler(this.updateSideEffects, 100).start();
  }

  private getAomNode(node: Node | null) {
    return node && this.store.getElement(getNodeKey(node));
  }

  private onFocus = (e: FocusEvent) => {
    const el = this.store.getElement(getNodeKey(e.target as Node));
    if (el instanceof NodeElement) {
      el.isFocused = true;
    }
  };

  private onBlur = (e: FocusEvent) => {
    const el = this.store.getElement(getNodeKey(e.target as Node));
    if (el instanceof NodeElement) {
      el.isFocused = false;
    }
  };

  private onInput = (event: any) => {
    runInAction("input", () => {
      this.updateNode(event.target);
    });
  };

  private onMutation = (mutations: MutationRecord[]) => {
    runInAction("mutation", () => {
      for (const mutation of mutations) {
        if (this.getAomNode(mutation.target)) {
          this.updateNode(mutation.target);
        }
      }
    });
  };

  private previousState = new WeakMap<Node, any>();
  private focused?: string;

  updateSideEffects = () => {
    runInAction("update side effects", () => {
      document.querySelectorAll('input[type="radio"]').forEach((node: any) => {
        if (this.previousState.get(node) !== node.checked) {
          this.updateNode(node);
          this.previousState.set(node, node.checked);
        }
      });

      document
        .querySelectorAll('input[type="checkbox"]')
        .forEach((node: any) => {
          if (this.previousState.get(node) !== node.indeterminate) {
            this.updateNode(node);
            this.previousState.set(node, node.indeterminate);
          }
        });

      document.querySelectorAll("input").forEach((node: any) => {
        if (this.previousState.get(node) !== node.value) {
          this.updateNode(node);
          this.previousState.set(node, node.value);
        }
      });

      const focusedKey = getNodeKey(document.activeElement as Node);

      if (focusedKey !== this.focused) {
        const oldEl = this.store.getElement(this.focused);
        if (oldEl instanceof NodeElement) {
          oldEl.isFocused = false;
        }

        const newEl = this.store.getElement(focusedKey);
        if (newEl instanceof NodeElement) {
          newEl.isFocused = true;
        }

        this.focused = focusedKey;
      }
    });
  };

  private updateNode = (node: Node) => {
    const newAOM = traverse(node);

    if (newAOM) {
      this.store.update(newAOM);
    }
  };

  disconnect() {
    this.observer.disconnect();
    this.scheduler.stop();
    document.body.removeEventListener("focus", this.onFocus, true);
    document.body.removeEventListener("blur", this.onBlur, true);
    document.body.removeEventListener("input", this.onInput, true);
    document.body.removeEventListener("transitionend", this.onInput, true);
  }
}
