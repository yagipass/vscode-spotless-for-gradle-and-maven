package io.github.yagipass.spotlessforgradleandmaven;

import java.io.File;
import java.util.HashSet;
import java.util.Set;
import javax.inject.Named;
import javax.inject.Singleton;
import org.apache.maven.eventspy.AbstractEventSpy;
import org.apache.maven.execution.ExecutionEvent;
import org.apache.maven.execution.MavenExecutionRequest;
import org.apache.maven.execution.MavenExecutionResult;

@Named("spotlessForGradleAndMavenCancellation")
@Singleton
public class CancellationSpy extends AbstractEventSpy {

  private static final long POLL_INTERVAL_MILLIS = 100;

  private final Set<Thread> buildThreads = new HashSet<>();
  private final Set<Thread> interruptedThreads = new HashSet<>();
  private Thread watcher;
  private boolean cancelled;

  @Override
  public synchronized void onEvent(Object event) {
    if (event instanceof MavenExecutionRequest) {
      String stdinPath =
          ((MavenExecutionRequest) event).getUserProperties().getProperty(PropertyNames.STDIN);
      if (stdinPath != null) {
        watch(new File(stdinPath));
      }
    } else if (event instanceof MavenExecutionResult) {
      stopWatching();
    } else if (event instanceof ExecutionEvent && watcher != null) {
      switch (((ExecutionEvent) event).getType()) {
        case ProjectStarted:
          enter();
          break;
        case ProjectSucceeded:
        case ProjectFailed:
          leave();
          break;
        default:
      }
    }
  }

  private void watch(File stdin) {
    stopWatching();
    enter();
    watcher = new Thread(() -> poll(stdin), "spotless-for-gradle-and-maven-cancellation");
    watcher.setDaemon(true);
    watcher.start();
  }

  private void poll(File stdin) {
    try {
      while (stdin.exists()) {
        Thread.sleep(POLL_INTERVAL_MILLIS);
      }
    } catch (InterruptedException e) {
      return;
    }
    cancel(Thread.currentThread());
  }

  private synchronized void cancel(Thread caller) {
    if (watcher != caller) {
      return;
    }
    cancelled = true;
    for (Thread thread : buildThreads) {
      interrupt(thread);
    }
  }

  private void stopWatching() {
    if (watcher != null) {
      watcher.interrupt();
      watcher = null;
    }
    leave();
    buildThreads.clear();
    interruptedThreads.clear();
    cancelled = false;
  }

  private void enter() {
    Thread thread = Thread.currentThread();
    buildThreads.add(thread);
    if (cancelled) {
      interrupt(thread);
    }
  }

  private void leave() {
    Thread thread = Thread.currentThread();
    buildThreads.remove(thread);
    if (interruptedThreads.remove(thread)) {
      Thread.interrupted();
    }
  }

  private void interrupt(Thread thread) {
    interruptedThreads.add(thread);
    thread.interrupt();
  }
}
