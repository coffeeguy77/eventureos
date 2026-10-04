/* EventureOS booking block (no build step) */
(function (blocks, element, blockEditor, components, serverSideRender) {
  var el = element.createElement;
  var InspectorControls = blockEditor.InspectorControls;
  var PanelBody = components.PanelBody, TextControl = components.TextControl, SelectControl = components.SelectControl;
  blocks.registerBlockType("eventureos/booking", {
    title: "EventureOS booking",
    description: "Your EventureOS booking form (classes, dates, payment, gift certificates).",
    icon: "calendar-alt",
    category: "widgets",
    attributes: { course: { type: "string", default: "" }, page: { type: "string", default: "" }, minHeight: { type: "number", default: 700 } },
    edit: function (props) {
      var a = props.attributes;
      return el("div", { className: props.className },
        el(InspectorControls, null,
          el(PanelBody, { title: "Booking form" },
            el(SelectControl, { label: "Show", value: a.page, options: [{ label: "Classes & booking", value: "" }, { label: "Gift certificates", value: "gift" }], onChange: function (v) { props.setAttributes({ page: v }); } }),
            el(TextControl, { label: "One course only (link name, optional)", value: a.course, onChange: function (v) { props.setAttributes({ course: v }); } }),
            el(TextControl, { label: "Starting height (px)", type: "number", value: a.minHeight, onChange: function (v) { props.setAttributes({ minHeight: parseInt(v, 10) || 700 }); } })
          )
        ),
        el("div", { style: { border: "1px dashed #c4c4cc", borderRadius: "12px", padding: "24px", textAlign: "center", background: "#fafafa" } },
          el("strong", null, "EventureOS booking form"),
          el("p", { style: { margin: "6px 0 0", color: "#71717a" } }, a.page === "gift" ? "Gift certificates" : a.course ? "Course: " + a.course : "All classes", " — shows on the live page.")
        )
      );
    },
    save: function () { return null; }
  });
})(window.wp.blocks, window.wp.element, window.wp.blockEditor, window.wp.components);
