package io.github.yagipass.spotlessforgradleandmaven;

import java.io.File;
import java.nio.file.Path;
import java.util.List;
import java.util.Properties;
import javax.inject.Named;
import javax.inject.Singleton;
import org.apache.maven.eventspy.AbstractEventSpy;
import org.apache.maven.execution.ExecutionEvent;
import org.apache.maven.execution.MavenSession;
import org.apache.maven.project.MavenProject;

@Named("spotlessForGradleAndMavenIdeHookPath")
@Singleton
public class IdeHookPathSpy extends AbstractEventSpy {

  @Override
  public void onEvent(Object event) {
    if (!(event instanceof ExecutionEvent)) {
      return;
    }
    ExecutionEvent executionEvent = (ExecutionEvent) event;
    if (executionEvent.getType() != ExecutionEvent.Type.SessionStarted) {
      return;
    }
    MavenSession session = executionEvent.getSession();
    String hookPath = session.getUserProperties().getProperty(PropertyNames.IDE_HOOK);
    String modulePath = session.getUserProperties().getProperty(PropertyNames.MODULE);
    List<MavenProject> projects = session.getProjects();
    if (hookPath == null || modulePath == null || projects.size() != 1) {
      return;
    }
    Path relative = new File(modulePath).toPath().relativize(new File(hookPath).toPath());
    if (relative.startsWith("..")) {
      return;
    }
    String rebasedHookPath = new File(projects.get(0).getBasedir(), relative.toString()).getPath();
    // Mojo parameters read the system properties after the user properties, and -D sets both.
    for (Properties properties :
        new Properties[] {session.getUserProperties(), session.getSystemProperties()}) {
      if (properties.containsKey(PropertyNames.IDE_HOOK)) {
        properties.setProperty(PropertyNames.IDE_HOOK, rebasedHookPath);
      }
    }
  }
}
