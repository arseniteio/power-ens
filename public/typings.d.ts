declare module 'pdfmake/build/pdfmake';
declare module 'pdfmake/build/vfs_fonts';

declare module '*.png' {
  const route: string;
  export default route;
}
