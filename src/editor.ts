import { createRoot } from "react-dom/client";
import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
  ConnectionPlugin,
  Presets as ConnectionPresets,
} from "rete-connection-plugin";
import { ReactPlugin, Presets, ReactArea2D } from "rete-react-plugin";

// Define the type for the schemes used in the editor
type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;
// Define extra types for the area plugin, specifically for React rendering
type AreaExtra = ReactArea2D<Schemes>;

// Function to create the editor instance
export async function createEditor(container: HTMLElement) {
  // Create a socket type for connections
  const socket = new ClassicPreset.Socket("socket");

  // Initialize the core editor, area plugin, connection plugin, and React rendering plugin
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<Schemes, AreaExtra>();
  const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });

  // Enable node selection features
  AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
    accumulating: AreaExtensions.accumulateOnCtrl(), // Use Ctrl/Cmd for multi-select
  });

  // Add classic preset styling and functionality for nodes and controls
  render.addPreset(Presets.classic.setup());
  // Add classic preset styling and functionality for connections
  connection.addPreset(ConnectionPresets.classic.setup());

  // Register the plugins with the editor and area
  editor.use(area);
  area.use(connection);
  area.use(render);

  // Enable simple node ordering (z-index)
  AreaExtensions.simpleNodesOrder(area);

  // --- Define Workflow Nodes ---

  // Start Node (NEW)
  const startNode = new ClassicPreset.Node("Start");
  startNode.addOutput("toAssigned", new ClassicPreset.Output(socket, "Begin")); // Output to start the process
  await editor.addNode(startNode);

  // Assigned Node
  const assignedNode = new ClassicPreset.Node("Assigned");
  assignedNode.addInput(
    "fromStart",
    new ClassicPreset.Input(socket, "From Start")
  ); // Input from Start
  assignedNode.addInput(
    "fromResolved",
    new ClassicPreset.Input(socket, "From Resolved")
  ); // Input from loopback
  assignedNode.addOutput(
    "toAccepted",
    new ClassicPreset.Output(socket, "To Accepted")
  );
  assignedNode.addOutput(
    "toCancelled",
    new ClassicPreset.Output(socket, "To Cancelled")
  );
  await editor.addNode(assignedNode);

  // Cancelled Node
  const cancelledNode = new ClassicPreset.Node("Cancelled");
  cancelledNode.addInput(
    "fromAssigned",
    new ClassicPreset.Input(socket, "From Assigned")
  );
  await editor.addNode(cancelledNode);

  // Accepted Node
  const acceptedNode = new ClassicPreset.Node("Accepted");
  acceptedNode.addInput(
    "fromAssigned",
    new ClassicPreset.Input(socket, "From Assigned")
  );
  acceptedNode.addOutput("toWip", new ClassicPreset.Output(socket, "To WIP"));
  await editor.addNode(acceptedNode);

  // Work in Progress Node
  const wipNode = new ClassicPreset.Node("Work in Progress");
  wipNode.addInput(
    "fromAccepted",
    new ClassicPreset.Input(socket, "From Accepted")
  );
  wipNode.addOutput(
    "toResolved",
    new ClassicPreset.Output(socket, "To Resolved")
  );
  await editor.addNode(wipNode);

  // Resolved Node
  const resolvedNode = new ClassicPreset.Node("Resolved");
  resolvedNode.addInput("fromWip", new ClassicPreset.Input(socket, "From WIP"));
  resolvedNode.addOutput(
    "toClosed",
    new ClassicPreset.Output(socket, "To Closed")
  );
  resolvedNode.addOutput(
    "toAssigned",
    new ClassicPreset.Output(socket, "To Assigned")
  ); // Output for loopback
  await editor.addNode(resolvedNode);

  // Closed Complete Node
  const closedNode = new ClassicPreset.Node("Closed Complete");
  closedNode.addInput(
    "fromResolved",
    new ClassicPreset.Input(socket, "From Resolved")
  );
  await editor.addNode(closedNode);

  // --- Define Workflow Connections ---

  // Start -> Assigned (NEW CONNECTION)
  await editor.addConnection(
    new ClassicPreset.Connection(
      startNode,
      "toAssigned", // Output key on Start node
      assignedNode,
      "fromStart" // Input key on Assigned node
    )
  );

  // Assigned -> Accepted
  await editor.addConnection(
    new ClassicPreset.Connection(
      assignedNode,
      "toAccepted",
      acceptedNode,
      "fromAssigned"
    )
  );
  // Assigned -> Cancelled
  await editor.addConnection(
    new ClassicPreset.Connection(
      assignedNode,
      "toCancelled",
      cancelledNode,
      "fromAssigned"
    )
  );
  // Accepted -> Work in Progress
  await editor.addConnection(
    new ClassicPreset.Connection(acceptedNode, "toWip", wipNode, "fromAccepted")
  );
  // Work in Progress -> Resolved
  await editor.addConnection(
    new ClassicPreset.Connection(wipNode, "toResolved", resolvedNode, "fromWip")
  );
  // Resolved -> Closed Complete
  await editor.addConnection(
    new ClassicPreset.Connection(
      resolvedNode,
      "toClosed",
      closedNode,
      "fromResolved"
    )
  );
  // Resolved -> Assigned (Loopback)
  await editor.addConnection(
    new ClassicPreset.Connection(
      resolvedNode,
      "toAssigned",
      assignedNode,
      "fromResolved"
    )
  );

  // --- Position Nodes ---
  // Arrange nodes visually to represent the flow
  const nodeSpacingX = 250; // Horizontal spacing between nodes
  const nodeSpacingY = 150; // Vertical spacing for branches

  // Position Start node at the beginning
  await area.translate(startNode.id, {
    x: -nodeSpacingX * 1.5,
    y: nodeSpacingY,
  });

  // Shift other nodes to the right to accommodate the Start node
  await area.translate(assignedNode.id, {
    x: -nodeSpacingX / 2,
    y: nodeSpacingY,
  });
  await area.translate(cancelledNode.id, { x: nodeSpacingX / 2, y: 0 }); // Branch up
  await area.translate(acceptedNode.id, {
    x: nodeSpacingX / 2,
    y: nodeSpacingY,
  });
  await area.translate(wipNode.id, {
    x: nodeSpacingX * 1.5,
    y: nodeSpacingY,
  });
  await area.translate(resolvedNode.id, {
    x: nodeSpacingX * 2.5,
    y: nodeSpacingY,
  });
  await area.translate(closedNode.id, {
    x: nodeSpacingX * 3.5,
    y: nodeSpacingY,
  });

  // Use a timeout to ensure nodes are rendered before zooming
  setTimeout(() => {
    // Adjust the view to fit all the nodes
    AreaExtensions.zoomAt(area, editor.getNodes());
  }, 100);

  // Return a cleanup function
  return {
    destroy: () => area.destroy(),
  };
}
