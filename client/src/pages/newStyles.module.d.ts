declare namespace NewStylesModuleScss {
    export interface INewStylesModuleScss {
      plotWrapper: string;
      plotPageWrapper: string;
    }
  }

declare const NewStylesModuleScssModule: NewStylesModuleScss.INewStylesModuleScss & {
    /** WARNING: Only available when `css-loader` is used without `style-loader` or `mini-css-extract-plugin` */
    locals: NewStylesModuleScss.INewStylesModuleScss;
  };

  export = NewStylesModuleScssModule;
