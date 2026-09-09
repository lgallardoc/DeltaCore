export interface ITextFileReader {
  readTextSync(absolutePath: string): string;
}
