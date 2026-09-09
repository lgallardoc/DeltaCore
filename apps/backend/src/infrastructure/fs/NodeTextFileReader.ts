import { readFileSync } from "node:fs";
import type { ITextFileReader } from "../../domain/ports/ITextFileReader.js";

export class NodeTextFileReader implements ITextFileReader {
  readTextSync(absolutePath: string): string {
    return readFileSync(absolutePath, "utf8");
  }
}
