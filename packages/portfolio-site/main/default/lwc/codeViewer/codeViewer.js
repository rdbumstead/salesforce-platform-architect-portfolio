/**
 * @description       : LWC to display highlighted source code.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, api } from "lwc";
// import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
// import PRISM from '@salesforce/resourceUrl/prism';

export default class CodeViewer extends LightningElement {
  @api title = "Source Code";
  @api recordId; // If provided, fetch from Apex
  @api language = "apex";

  codeContent = `
public class HelloWorld {
    public static void sayHello() {
        System.debug('Hello World');
    }
}
    `;

  isLoading = false;
  prismInitialized = false;

  renderedCallback() {
    if (this.prismInitialized) return;
    this.prismInitialized = true;

    // Future: Load Prism Static Resource
    /*
        Promise.all([
            loadScript(this, PRISM + '/prism.js'),
            loadStyle(this, PRISM + '/prism.css')
        ]).then(() => {
            // Prism.highlightAll();
        });
        */
  }

  handleCopy() {
    // Simple clipboard copy
    navigator.clipboard.writeText(this.codeContent);
    // Show Toast (not available in all contexts, use console for now)
    // eslint-disable-next-line no-console
    console.log("Copied to clipboard");
  }
}
