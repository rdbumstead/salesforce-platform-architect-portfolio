/**
 * @description       : LWC form for submitting new testimonials with vibe toggle.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { LightningElement } from "lwc";
// Future: Import Apex method to save record
// import createTestimonial from '@salesforce/apex/TestimonialController.createTestimonial';

export default class TestimonialSubmit extends LightningElement {
  formData = {
    relationship: "",
    context: "",
    authorName: "",
    vibeMode: "Professional"
  };

  get relationshipOptions() {
    return [
      { label: "Manager", value: "Manager" },
      { label: "Peer", value: "Peer" },
      { label: "Client", value: "Client" },
      { label: "Recruiter", value: "Recruiter" },
      { label: "Fan/Visitor", value: "Fan" }
    ];
  }

  get isCasual() {
    return this.formData.vibeMode === "Casual";
  }

  get isSubmitDisabled() {
    return (
      !this.formData.relationship ||
      !this.formData.context ||
      !this.formData.authorName
    );
  }

  handleChange(event) {
    const field = event.target.name;
    this.formData[field] = event.target.value;
  }

  handleVibeToggle(event) {
    this.formData.vibeMode = event.target.checked ? "Casual" : "Professional";
  }

  handleSubmit() {
    // console.log('Submitting Testimonial:', JSON.stringify(this.formData));
    // Future: Apex Call
    // createTestimonial({ testimonial: this.formData })
    //     .then(() => { ... })
    //     .catch(error => { ... });

    // Mock Success
    // alert('Thanks for the review! It awaits approval.');

    // Reset Form
    this.formData = {
      relationship: "",
      context: "",
      authorName: "",
      vibeMode: "Professional"
    };
    [
      ...this.template.querySelectorAll("lightning-input, lightning-combobox")
    ].forEach((input) => {
      input.value = null;
    });
  }
}
